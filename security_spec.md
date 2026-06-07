# LOD Security Specification

## Data Invariants
1. A Haul must have a valid `ownerId` matching the authenticated user.
2. An Expense must belong to a Haul owned by the same user.
3. A Haul cannot be modified once set to `Completed`, except for specific state transitions or by an admin.
4. All mileage and rate values must be non-negative.
5. All IDs must match `^[a-zA-Z0-9_\\-]+$`.

## The Dirty Dozen Payloads
1. **Identity Spoofing**: Attempt to create a haul with someone else's `ownerId`.
2. **State Shortcutting**: Attempt to create a haul directly in `Completed` status with invalid totals.
3. **Resource Poisoning**: Injection of 1.5KB string into `unitNumber`.
4. **Update Gap**: Updating `grossRevenue` without updating the underlying `miles` or `rpm`.
5. **Orphaned Write**: Creating an expense for a haul ID that doesn't exist.
6. **Cross-Tenant Leak**: Reading expenses of a haul owned by user B while logged in as user A.
7. **Negative Value Attack**: Setting `ratePerMile` to `-50.00`.
8. **Immutability Breach**: Changing `createdAt` on an existing haul.
9. **Bulk Scrape**: Listing/Getting all hauls without an owner filter.
10. **Shadow Field**: Adding `isAdmin: true` to a haul document.
11. **Timestamp Forgery**: Providing a client-side `updatedAt` that isn't `request.time`.
12. **Lock Bypass**: Editing `miles` on a `Completed` haul.

## Test Runner
Verified via `firestore.rules.test.ts` (Implementation pending).
