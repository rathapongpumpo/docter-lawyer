-- Better Auth twoFactor plugin (v1.7) columns: TOTP verification state + brute-force lockout (FR-AUTH-025)
-- Found by Better Auth's startup schema check; the DDL in docs/03-technical-spec.md §2.3.5 was written before these existed.
ALTER TABLE app.two_factors
  ADD COLUMN verified boolean NOT NULL DEFAULT true,
  ADD COLUMN failed_verification_count integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;
