--
-- This file is part of ANASTASIS
-- Copyright (C) 2014--2020 Anastasis Systems SA
--
-- ANASTASIS is free software; you can redistribute it and/or modify it under the
-- terms of the GNU General Public License as published by the Free Software
-- Foundation; either version 3, or (at your option) any later version.
--
-- ANASTASIS is distributed in the hope that it will be useful, but WITHOUT ANY
-- WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
-- A PARTICULAR PURPOSE.  See the GNU General Public License for more details.
--
-- You should have received a copy of the GNU General Public License along with
-- ANASTASIS; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
--

-- Everything in one big transaction
BEGIN;

-- This script DROPs all of the tables we create.
--
-- Unlike the other SQL files, it SHOULD be updated to reflect the
-- latest requirements for dropping tables.

-- Drops for 0001.sql
DROP TABLE IF EXISTS anastasis_truth CASCADE;
DROP TABLE IF EXISTS anastasis_user CASCADE;
DROP TABLE IF EXISTS anastasis_recdoc_payment;
DROP TABLE IF EXISTS anastasis_recoverydocument;
DROP TABLE IF EXISTS anastasis_challengecode;
DROP TABLE IF EXISTS anastasis_challenge_payment;
DROP TABLE IF EXISTS anastasis_auth_iban_in;

-- Unregister patch (0001.sql)
SELECT _v.unregister_patch('stasis-0001');

-- And we're out of here...
COMMIT;
