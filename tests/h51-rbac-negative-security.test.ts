import assert from 'node:assert/strict';
import test from 'node:test';

interface BusinessUser {
  id: string;
  auth_user_id: string | null;
  status: string;
  account_status: string;
  system_permission: 'admin' | 'leader' | 'member';
  archived_at: string | null;
  deleted_at: string | null;
}

interface Report {
  id: string;
  brand_id: string;
  submitted_by: string | null;
  status: 'draft' | 'confirmed';
  metrics_confirmed: boolean;
  archived_at: string | null;
  deleted_at: string | null;
}

interface ReportImage {
  id: string;
  report_id: string;
  uploaded_by: string | null;
  provider: string | null;
  external_file_id: string | null;
}

interface Shift {
  id: string;
  brand_id: string;
  version: number;
  status: string;
}

// Simulates PostgreSQL Supabase Auth / PostgREST session semantics
class SecurityContextSimulator {
  private users: Map<string, BusinessUser> = new Map();
  private reports: Map<string, Report> = new Map();
  private images: Map<string, ReportImage> = new Map();
  private shifts: Map<string, Shift> = new Map();

  constructor() {
    // Seed fixtures
    this.users.set('admin-1', {
      id: 'admin-1',
      auth_user_id: 'auth-admin-uuid',
      status: 'active',
      account_status: 'active',
      system_permission: 'admin',
      archived_at: null,
      deleted_at: null,
    });
    this.users.set('leader-1', {
      id: 'leader-1',
      auth_user_id: 'auth-leader-uuid',
      status: 'active',
      account_status: 'active',
      system_permission: 'leader',
      archived_at: null,
      deleted_at: null,
    });
    this.users.set('member-1', {
      id: 'member-1',
      auth_user_id: 'auth-member1-uuid',
      status: 'active',
      account_status: 'active',
      system_permission: 'member',
      archived_at: null,
      deleted_at: null,
    });
    this.users.set('member-2', {
      id: 'member-2',
      auth_user_id: 'auth-member2-uuid',
      status: 'active',
      account_status: 'active',
      system_permission: 'member',
      archived_at: null,
      deleted_at: null,
    });
    this.users.set('disabled-user', {
      id: 'disabled-user',
      auth_user_id: 'auth-disabled-uuid',
      status: 'suspended',
      account_status: 'suspended',
      system_permission: 'member',
      archived_at: null,
      deleted_at: null,
    });
    this.users.set('archived-user', {
      id: 'archived-user',
      auth_user_id: 'auth-archived-uuid',
      status: 'active',
      account_status: 'active',
      system_permission: 'member',
      archived_at: '2026-10-01T00:00:00Z',
      deleted_at: null,
    });

    this.reports.set('rep-draft-1', {
      id: 'rep-draft-1',
      brand_id: 'brand-alpha',
      submitted_by: 'member-1',
      status: 'draft',
      metrics_confirmed: false,
      archived_at: null,
      deleted_at: null,
    });
    this.reports.set('rep-confirmed-1', {
      id: 'rep-confirmed-1',
      brand_id: 'brand-alpha',
      submitted_by: 'member-1',
      status: 'confirmed',
      metrics_confirmed: true,
      archived_at: null,
      deleted_at: null,
    });
    this.reports.set('rep-status-confirmed-only', {
      id: 'rep-status-confirmed-only',
      brand_id: 'brand-alpha',
      submitted_by: 'member-1',
      status: 'confirmed',
      metrics_confirmed: false,
      archived_at: null,
      deleted_at: null,
    });
    this.reports.set('rep-deleted', {
      id: 'rep-deleted',
      brand_id: 'brand-alpha',
      submitted_by: 'member-1',
      status: 'draft',
      metrics_confirmed: false,
      archived_at: null,
      deleted_at: '2026-10-10T12:00:00Z',
    });
    this.reports.set('rep-archived', {
      id: 'rep-archived',
      brand_id: 'brand-alpha',
      submitted_by: 'member-1',
      status: 'draft',
      metrics_confirmed: false,
      archived_at: '2026-10-10T12:00:00Z',
      deleted_at: null,
    });
    this.reports.set('rep-brand-beta', {
      id: 'rep-brand-beta',
      brand_id: 'brand-beta',
      submitted_by: 'member-2',
      status: 'draft',
      metrics_confirmed: false,
      archived_at: null,
      deleted_at: null,
    });

    this.images.set('img-member1', {
      id: 'img-member1',
      report_id: 'rep-draft-1',
      uploaded_by: 'member-1',
      provider: 'google_drive',
      external_file_id: 'drive-111',
    });
    this.images.set('img-null-uploader', {
      id: 'img-null-uploader',
      report_id: 'rep-draft-1',
      uploaded_by: null,
      provider: 'google_drive',
      external_file_id: 'drive-222',
    });
    this.images.set('img-confirmed', {
      id: 'img-confirmed',
      report_id: 'rep-confirmed-1',
      uploaded_by: 'member-1',
      provider: 'google_drive',
      external_file_id: 'drive-333',
    });
    this.images.set('img-status-confirmed-only', {
      id: 'img-status-confirmed-only',
      report_id: 'rep-status-confirmed-only',
      uploaded_by: 'member-1',
      provider: 'google_drive',
      external_file_id: 'drive-888',
    });
    this.images.set('img-deleted-report', {
      id: 'img-deleted-report',
      report_id: 'rep-deleted',
      uploaded_by: 'member-1',
      provider: 'google_drive',
      external_file_id: 'drive-777',
    });
    this.images.set('img-archived-report', {
      id: 'img-archived-report',
      report_id: 'rep-archived',
      uploaded_by: 'member-1',
      provider: 'google_drive',
      external_file_id: 'drive-666',
    });

    this.shifts.set('shift-100', {
      id: 'shift-100',
      brand_id: 'brand-alpha',
      version: 1,
      status: 'scheduled',
    });
  }

  // Corresponds to private.current_business_user_id()
  resolveCurrentBusinessUserId(authUid: string | null): string | null {
    if (!authUid) return null;
    for (const u of this.users.values()) {
      if (
        u.auth_user_id === authUid &&
        u.status === 'active' &&
        u.account_status === 'active' &&
        u.archived_at === null &&
        u.deleted_at === null
      ) {
        return u.id;
      }
    }
    return null;
  }

  // Corresponds to public.authorize_report_image_delete(p_image_id)
  authorizeReportImageDelete(authUid: string | null, imageId: string): boolean {
    const actorId = this.resolveCurrentBusinessUserId(authUid);
    if (!actorId) {
      throw { code: '42501', message: 'AUTHENTICATION_REQUIRED' };
    }
    const img = this.images.get(imageId);
    if (!img) return false;

    const rep = this.reports.get(img.report_id);
    if (!rep || rep.deleted_at !== null || rep.archived_at !== null) {
      throw { code: 'P0001', message: 'REPORT_NOT_FOUND' };
    }

    const actor = this.users.get(actorId)!;
    if (actor.system_permission === 'member') {
      if (img.uploaded_by === null || img.uploaded_by !== actorId) {
        throw { code: '42501', message: 'OPERATION_NOT_ALLOWED' };
      }
      if (rep.submitted_by === null || rep.submitted_by !== actorId) {
        throw { code: '42501', message: 'OPERATION_NOT_ALLOWED' };
      }
    }

    if (rep.metrics_confirmed || rep.status === 'confirmed') {
      throw { code: 'P0001', message: 'REPORT_CONFIRMED' };
    }

    return true;
  }

  // Corresponds to public.update_shift with concurrency version trigger
  updateShift(authUid: string | null, shiftId: string, expectedVersion: number): Shift {
    const actorId = this.resolveCurrentBusinessUserId(authUid);
    if (!actorId) {
      throw { code: '42501', message: 'AUTHENTICATION_REQUIRED' };
    }
    const shift = this.shifts.get(shiftId);
    if (!shift) {
      throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' };
    }
    // Optimistic concurrency lock
    if (shift.version !== expectedVersion) {
      throw { code: 'P0001', message: 'OPTIMISTIC_LOCK_CONFLICT' };
    }

    // Trigger shifts_bump_concurrency_version simulation: new.version = old.version + 1
    shift.version += 1;
    return shift;
  }
}

test('H.5.1 Role & Security: Unauthenticated caller is blocked fail-closed', () => {
  const sim = new SecurityContextSimulator();
  assert.throws(
    () => sim.authorizeReportImageDelete(null, 'img-member1'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === '42501' && e?.message === 'AUTHENTICATION_REQUIRED'; }
  );
});

test('H.5.1 Role & Security: Disabled or archived accounts resolve to NULL and are blocked', () => {
  const sim = new SecurityContextSimulator();
  // Suspended account
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-disabled-uuid', 'img-member1'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === '42501' && e?.message === 'AUTHENTICATION_REQUIRED'; }
  );
  // Archived account
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-archived-uuid', 'img-member1'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === '42501' && e?.message === 'AUTHENTICATION_REQUIRED'; }
  );
});

test('H.5.1 Role & Security: NULL uploaded_by is strictly blocked for Member', () => {
  const sim = new SecurityContextSimulator();
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-member1-uuid', 'img-null-uploader'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === '42501' && e?.message === 'OPERATION_NOT_ALLOWED'; }
  );
});

test('H.5.1 Role & Security: Cross-member deletion is rejected', () => {
  const sim = new SecurityContextSimulator();
  // Member 2 attempting to delete Member 1\'s image
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-member2-uuid', 'img-member1'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === '42501' && e?.message === 'OPERATION_NOT_ALLOWED'; }
  );
});

test('H.5.1 Role & Security: Admin and Leader can delete member image on draft report', () => {
  const sim = new SecurityContextSimulator();
  assert.equal(sim.authorizeReportImageDelete('auth-admin-uuid', 'img-member1'), true);
  assert.equal(sim.authorizeReportImageDelete('auth-leader-uuid', 'img-member1'), true);
});

test('H.5.2 Regression: status=confirmed with metrics_confirmed=false is immutable against all roles', () => {
  const sim = new SecurityContextSimulator();
  // Member
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-member1-uuid', 'img-status-confirmed-only'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_CONFIRMED'; }
  );
  // Admin
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-admin-uuid', 'img-status-confirmed-only'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_CONFIRMED'; }
  );
  // Leader
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-leader-uuid', 'img-status-confirmed-only'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_CONFIRMED'; }
  );
});

test('H.5.2 Regression: Deleted or archived report images reject deletion as REPORT_NOT_FOUND', () => {
  const sim = new SecurityContextSimulator();
  // Deleted report
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-member1-uuid', 'img-deleted-report'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_NOT_FOUND'; }
  );
  // Archived report
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-member1-uuid', 'img-archived-report'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_NOT_FOUND'; }
  );
});

test('H.5.1 Role & Security: Confirmed report images are immutable against all roles', () => {
  const sim = new SecurityContextSimulator();
  // Member
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-member1-uuid', 'img-confirmed'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_CONFIRMED'; }
  );
  // Leader
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-leader-uuid', 'img-confirmed'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_CONFIRMED'; }
  );
  // Admin
  assert.throws(
    () => sim.authorizeReportImageDelete('auth-admin-uuid', 'img-confirmed'),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'REPORT_CONFIRMED'; }
  );
});

test('H.5.1 Shift Concurrency: expected_version increments and rejects stale writes', () => {
  const sim = new SecurityContextSimulator();
  // Valid update with expected_version = 1
  const updated = sim.updateShift('auth-leader-uuid', 'shift-100', 1);
  assert.equal(updated.version, 2, 'Version must increment to 2');

  // Stale update with expected_version = 1 must be rejected
  assert.throws(
    () => sim.updateShift('auth-leader-uuid', 'shift-100', 1),
    (err: unknown) => { const e = err as { code?: string; message?: string }; return e?.code === 'P0001' && e?.message === 'OPTIMISTIC_LOCK_CONFLICT'; }
  );

  // Subsequent update with expected_version = 2 succeeds
  const updatedAgain = sim.updateShift('auth-leader-uuid', 'shift-100', 2);
  assert.equal(updatedAgain.version, 3, 'Version must increment to 3');
});
