"use client";

import * as React from "react";
import {
  isStaffedRegistration,
  shiftRegistrationService,
  swapRequestService,
} from "@/lib/services/dataService";
import {
  Shift,
  User,
  Brand,
  Platform,
  OperationalRole,
} from "@/lib/types/database.types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useTranslation } from "@/lib/i18n";
import { formatShiftTimeRange } from "@/lib/utils/shiftUtils";

interface SwapRequestFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: Shift[];
  users: User[];
  brands: Brand[];
  platforms: Platform[];
  onSuccess: () => void;
}

interface FormData {
  shift_id: string;
  requester_id: string;
  operational_role: OperationalRole | "";
  replacement_staff_id: string;
  reason: string;
}

export function SwapRequestFormModal({
  open,
  onOpenChange,
  shifts,
  users,
  brands,
  platforms,
  onSuccess,
}: SwapRequestFormModalProps) {
  const [formData, setFormData] = React.useState<FormData>({
    shift_id: "",
    requester_id: "",
    operational_role: "",
    replacement_staff_id: "",
    reason: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormData, string>>
  >({});
  const [registeredRoles, setRegisteredRoles] = React.useState<
    Record<string, OperationalRole[]>
  >({});
  const [registrationIds, setRegistrationIds] = React.useState<
    Record<string, string>
  >({});
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();
  const { t } = useTranslation();
  const tr = t as unknown as (key: string) => string;

  const currentUserId = currentUser?.id;

  // A. Form initialization
  React.useEffect(() => {
    if (open && currentUserId) {
      setFormData({
        shift_id: "",
        requester_id: currentUserId,
        operational_role: "",
        replacement_staff_id: "",
        reason: "",
      });
      setErrors({});
    }
  }, [open, currentUserId]);

  // B. Canonical registration loading
  React.useEffect(() => {
    if (open && currentUserId) {
      void shiftRegistrationService
        .getForUser(currentUserId)
        .then((registrations) => {
          const next: Record<string, OperationalRole[]> = {};
          const ids: Record<string, string> = {};
          registrations
            .filter(isStaffedRegistration)
            .forEach((registration) => {
              (next[registration.shift_id] ??= []).push(
                registration.operational_role,
              );
              ids[`${registration.shift_id}:${registration.operational_role}`] =
                registration.id;
            });
          setRegisteredRoles(next);
          setRegistrationIds(ids);
        });
    }
  }, [open, currentUserId]);

  const byRole = (role: "host" | "support" | "technical") =>
    users.filter(
      (u) =>
        u.status === "active" &&
        (u.operational_roles?.includes(role) ||
          (role === "host" && u.department === "Live Host") ||
          (role === "support" && u.department === "Live Support")),
    );

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.shift_id)
      newErrors.shift_id =
        tr("selectAssignedShift") || "Select one of your assigned shifts";
    if (!formData.operational_role)
      newErrors.operational_role =
        tr("selectRoleToReplace") || "Select the role you want replaced";
    if (!formData.replacement_staff_id)
      newErrors.replacement_staff_id =
        tr("selectReplacementPerson") || "Select a replacement person";

    if (formData.replacement_staff_id && formData.operational_role) {
      const eligible = byRole(formData.operational_role);
      if (!eligible.find((u) => u.id === formData.replacement_staff_id)) {
        newErrors.replacement_staff_id =
          tr("replacementRoleEligibilityError") ||
          "Replacement must be eligible for the selected role";
      }
    }

    if (!formData.reason.trim() || formData.reason.trim().length < 10) {
      newErrors.reason =
        tr("reasonRequiredLengthError") ||
        "Reason must be at least 10 characters";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast({
        title: tr("validationError") || "Validation Error",
        description: Object.values(newErrors)[0] as string,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      const operationalRole = formData.operational_role as OperationalRole;
      const sourceRegistrationId =
        registrationIds[`${formData.shift_id}:${operationalRole}`];
      if (!sourceRegistrationId)
        throw new Error(
          tr("activeSourceRegistrationRequired") ||
            "An active source registration is required.",
        );
      const replacementStaffId = formData.replacement_staff_id;
      const selectedShift = shifts.find(
        (shift) => shift.id === formData.shift_id,
      );
      const originalStaffId =
        operationalRole === "host"
          ? selectedShift?.host_id
          : operationalRole === "support"
            ? selectedShift?.support_id
            : selectedShift?.technical_id;
      if (!currentUser || currentUser.id !== formData.requester_id)
        throw new Error(t("permissionDenied"));
      await swapRequestService.create({
        shift_id: formData.shift_id,
        requester_id: formData.requester_id,
        operational_role: operationalRole,
        original_staff_id: originalStaffId,
        replacement_staff_id: replacementStaffId,
        new_host_id:
          operationalRole === "host" ? replacementStaffId : undefined,
        new_support_id:
          operationalRole === "support" ? replacementStaffId : undefined,
        new_technical_id:
          operationalRole === "technical" ? replacementStaffId : undefined,
        reason: formData.reason.trim(),
        source_registration_id: sourceRegistrationId,
        mode: "replacement",
      });

      toast({
        title: tr("requestSubmitted") || "Request Submitted",
        description:
          tr("swapRequestSubmittedHelp") ||
          "Your swap request has been submitted for approval",
        variant: "success",
      });

      onSuccess();
    } catch (error) {
      toast({
        title: tr("submissionFailed") || "Submission Failed",
        description:
          error instanceof Error
            ? error.message
            : tr("swapRequestFailedHelp") ||
              "Failed to submit swap request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getBrandName = (brandId: string) =>
    brands.find((b) => b.id === brandId)?.name ||
    tr("unknownBrand") ||
    "Unknown";
  const getPlatformName = (platformId: string) =>
    platforms.find((p) => p.id === platformId)?.name ||
    tr("unknownPlatform") ||
    "Unknown";

  const eligibleShifts = React.useMemo(
    () => shifts.filter((s) => (registeredRoles[s.id] || []).length > 0),
    [shifts, registeredRoles],
  );
  const selectedShift = shifts.find((s) => s.id === formData.shift_id);

  const availableRoles = React.useMemo(() => {
    if (!selectedShift || !currentUser) return [];
    return registeredRoles[selectedShift.id] || [];
  }, [currentUser, registeredRoles, selectedShift]);

  React.useEffect(() => {
    if (
      formData.shift_id &&
      availableRoles.length === 1 &&
      formData.operational_role !== availableRoles[0]
    ) {
      setFormData((f) => ({ ...f, operational_role: availableRoles[0] }));
    }
  }, [formData.shift_id, availableRoles, formData.operational_role]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tr("requestShiftSwap") || "Request Shift Swap"}
          </DialogTitle>
          <DialogDescription>
            {tr("requestShiftSwapHelp") ||
              "Request to swap your assigned shift with another host. Requires approval from team leader or admin."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Shift Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              {tr("selectYourShift") || "Select Your Shift"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <Select
              value={formData.shift_id}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  shift_id: value,
                  operational_role: "",
                  replacement_staff_id: "",
                })
              }
            >
              <SelectTrigger
                className={errors.shift_id ? "border-red-500" : ""}
              >
                <SelectValue
                  placeholder={tr("chooseShift") || "Choose a shift..."}
                />
              </SelectTrigger>
              <SelectContent>
                {eligibleShifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {getBrandName(shift.brand_id)} -{" "}
                    {getPlatformName(shift.platform_id)}(
                    {format(new Date(`${shift.date}T00:00:00`), "MMM d")},{" "}
                    {formatShiftTimeRange(shift)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.shift_id && (
              <div className="text-xs text-red-500 mt-1">{errors.shift_id}</div>
            )}
          </div>

          {/* Shift Details Preview */}
          {selectedShift && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-900 mb-2">
                {tr("selectedShiftDetails") || "Selected Shift Details"}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-700">{tr("brand")}:</span>
                  <span className="font-medium ml-2">
                    {getBrandName(selectedShift.brand_id)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">{tr("platform")}:</span>
                  <span className="font-medium ml-2">
                    {getPlatformName(selectedShift.platform_id)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">{tr("date")}:</span>
                  <span className="font-medium ml-2">
                    {format(new Date(selectedShift.date), "MMMM d, yyyy")}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">{tr("time")}:</span>
                  <span className="font-medium ml-2">
                    {formatShiftTimeRange(selectedShift)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Role and Replacement selection */}
          {formData.shift_id && availableRoles.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {tr("roleToReplace") || "Role to Replace"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <Select
                  value={formData.operational_role || "none"}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      operational_role:
                        value === "none" ? "" : (value as OperationalRole),
                      replacement_staff_id: "",
                    })
                  }
                >
                  <SelectTrigger
                    className={errors.operational_role ? "border-red-500" : ""}
                  >
                    <SelectValue
                      placeholder={tr("selectRole") || "Select role..."}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.operational_role && (
                  <div className="text-xs text-red-500 mt-1">
                    {errors.operational_role}
                  </div>
                )}
              </div>

              {formData.operational_role && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {tr("replacementPerson") || "Replacement Person"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={formData.replacement_staff_id || "none"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        replacement_staff_id: value === "none" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger
                      className={
                        errors.replacement_staff_id ? "border-red-500" : ""
                      }
                    >
                      <SelectValue
                        placeholder={
                          tr("selectReplacement") || "Select replacement..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {byRole(formData.operational_role as OperationalRole)
                        .filter((user) => user.id !== currentUser?.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.full_name} ({user.email})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.replacement_staff_id && (
                    <div className="text-xs text-red-500 mt-1">
                      {errors.replacement_staff_id}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {formData.shift_id && availableRoles.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noMyShifts")}</p>
          )}

          {/* Reason */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              {tr("reasonForSwapRequest") || "Reason for Swap Request"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <Textarea
              placeholder={
                tr("reasonPlaceholder") ||
                "Please provide a detailed explanation for your swap request (e.g., personal emergency, scheduling conflict, health issue)..."
              }
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              rows={5}
              className={errors.reason ? "border-red-500" : ""}
            />
            {errors.reason && (
              <div className="text-xs text-red-500 mt-1">{errors.reason}</div>
            )}
            <div className="text-xs text-gray-600 mt-1">
              {formData.reason.length} / 500 {tr("characters") || "characters"}
            </div>
          </div>

          {/* Important Note */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-sm font-medium text-yellow-900 mb-1">
              {tr("important") || "Important"}
            </div>
            <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
              <li>
                {tr("swapApprovalHelp") ||
                  "Swap requests require approval from team leader or admin"}
              </li>
              <li>
                {tr("swapReplacementHelp") ||
                  "The proposed replacement must be available and qualified"}
              </li>
              <li>
                {tr("swapNotifyHelp") ||
                  "You will be notified once your request is reviewed"}
              </li>
              <li>
                {tr("swapEmergencyHelp") ||
                  "Emergency swaps may be prioritized"}
              </li>
            </ul>
          </div>

          {/* Actions */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {tr("cancel") || "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tr("submitRequest") || "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
