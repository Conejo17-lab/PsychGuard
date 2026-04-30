# Security Specification - PsychGuard

## Data Invariants
1. A Session must have a valid `patientId` and `psychologistId`.
2. A Feedback must be linked to a valid `sessionId`.
3. Psychologists can only access their own patients' data.
4. Patients can only access their own sessions and submit feedback for their own sessions.
5. Admins have full access.

## The Dirty Dozen Payloads
1. **P1 (Identity Spoofing):** Patient A tries to create a session for Patient B.
2. **P2 (Identity Spoofing):** Psychologist A tries to view Psychologist B's patients.
3. **P3 (Privilege Escalation):** Patient tries to mark themselves as an admin in Firestore.
4. **P4 (Resource Poisoning):** User tries to inject a 2MB string into `name`.
5. **P5 (State Shortcutting):** User tries to update session status from `scheduled` directly to `completed` without `startTime` and `endTime` being valid.
6. **P6 (Orphaned Write):** Creating feedback for a non-existent session.
7. **P7 (Unauthorized Read):** Patient B tries to read the `complaints` of Patient A.
8. **P8 (Unverified Write):** Unauthenticated user tries to write to the `sessions` collection.
9. **P9 (Timestamp Manipulation):** User tries to set `createdAt` in the past.
10. **P10 (Field Injection):** Adding `isVerified: true` to a psychologist profile.
11. **P11 (ID Poisoning):** Using a 500-character gibberish string as a `sessionId`.
12. **P12 (Relational Break):** Psychologist tries to delete a session they didn't create or aren't assigned to.

## Test Runner
I will create `firestore.rules.test.ts` (conceptual, will focus on rules implementation first as per instructions).
