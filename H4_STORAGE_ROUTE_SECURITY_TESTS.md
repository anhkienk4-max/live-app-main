# H4 STORAGE ROUTE SECURITY TESTS REPORT

**Subject:** Contract Validation of `selectOperationalStorageRoute`  
**Test Suite:** `tests/h4-storage-route-security.test.ts`  
**Status:** 8 / 8 CASES PASSED (100%)  

---

## 1. CONTRACT SPECIFICATION FOR `selectOperationalStorageRoute`

Function signature:
```typescript
export function selectOperationalStorageRoute(
  routes: readonly OperationalStorageRoute[],
  input: OperationalStorageRouteKey,
): OperationalStorageRoute
```

Strict routing rules:
1. **Active Only:** Inactive routes (`active: false`) are never eligible.
2. **Exact Attributes:** `provider`, `execution_source`, and `brand_id` must match exactly.
3. **Subbrand Strictness:** A subbrand-scoped file (`subbrandKey !== null`) **must never fall back** to a NULL-subbrand route. A generic file (`subbrandKey === null`) **must never enter** a subbrand-scoped route.
4. **Platform Specificity:** Exact platform routes beat broad (NULL platform) routes. An input requiring a NULL platform cannot route into a specific platform route.
5. **Ambiguity Fail-Closed:** If two or more routes have identical highest specificity score, the resolver throws `STORAGE_ROUTE_AMBIGUOUS`.
6. **No Route Fail-Closed:** If no approved route matches, the resolver throws `STORAGE_ROUTE_NOT_CONFIGURED`.

---

## 2. TEST MATRIX RESULTS

| Case | Scenario | Expected Behavior | Result |
| :--- | :--- | :--- | :--- |
| **Case 1** | Exact Brand + Platform + Subbrand | Returns exact candidate matching all three keys | **PASS** (1.54ms) |
| **Case 2** | Brand + Platform, without Subbrand | Returns platform route with `subbrand_key: null` | **PASS** (0.33ms) |
| **Case 3a** | NULL Platform input vs Specific Platform route | Rejects candidate, throws `STORAGE_ROUTE_NOT_CONFIGURED` | **PASS** (0.43ms) |
| **Case 3b** | Specific Platform input vs Broad + Specific routes | Chooses specific platform route over broad route | **PASS** |
| **Case 4a** | Specific Subbrand input vs NULL Subbrand route | Rejects candidate, throws `STORAGE_ROUTE_NOT_CONFIGURED` | **PASS** (0.27ms) |
| **Case 4b** | NULL Subbrand input vs Specific Subbrand route | Rejects candidate, throws `STORAGE_ROUTE_NOT_CONFIGURED` | **PASS** |
| **Case 5** | Multiple valid routes with equal specificity | Fails closed with `STORAGE_ROUTE_AMBIGUOUS` | **PASS** (0.27ms) |
| **Case 6** | Empty / No matching routes | Fails closed with `STORAGE_ROUTE_NOT_CONFIGURED` | **PASS** (0.17ms) |
| **Case 7** | Wrong `execution_source` (`agency` vs `internal`) | Rejects candidate, throws `STORAGE_ROUTE_NOT_CONFIGURED` | **PASS** (0.25ms) |
| **Case 8** | Cross-brand, cross-platform, and inactive isolation | Strict isolation; unauthorized routes never selected | **PASS** (0.25ms) |

---

## 3. REGRESSION COMPATIBILITY

- `tests/operational-storage-placement.test.ts`: 27 / 27 PASS.
- `tests/rc15-operational-file-storage.test.ts`: 14 / 14 PASS.
- Total route & storage test cases across suites: 49 / 49 PASS.
