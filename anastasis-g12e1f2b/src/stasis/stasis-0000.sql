-- LICENSE AND COPYRIGHT
--
-- Copyright (C) 2010 Hubert depesz Lubaczewski
--
-- This program is distributed under the (Revised) BSD License:
-- L<http://www.opensource.org/licenses/bsd-license.php>
--
-- Redistribution and use in source and binary forms, with or without
-- modification, are permitted provided that the following conditions
-- are met:
--
-- * Redistributions of source code must retain the above copyright
-- notice, this list of conditions and the following disclaimer.
--
-- * Redistributions in binary form must reproduce the above copyright
--   notice, this list of conditions and the following disclaimer in the
--   documentation and/or other materials provided with the distribution.
--
-- * Neither the name of Hubert depesz Lubaczewski's Organization
--   nor the names of its contributors may be used to endorse or
--   promote products derived from this software without specific
--   prior written permission.
--
-- THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
-- AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
-- IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
-- DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
-- FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
-- DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
-- SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
-- CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
-- OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
-- OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
--
-- Code origin: https://gitlab.com/depesz/Versioning/blob/master/install.versioning.sql
--
--
-- # NAME
--
-- **Versioning** - simplistic take on tracking and applying changes to databases.
--
-- # DESCRIPTION
--
-- This project strives to provide simple way to manage changes to
-- database.
--
-- Instead of making changes on development server, then finding
-- differences between production and development, deciding which ones
-- should be installed on production, and finding a way to install them -
-- you start with writing diffs themselves!
--
-- # INSTALLATION
--
-- To install versioning simply run install.versioning.sql in your database
-- (all of them: production, stage, test, devel, ...).
--
-- # USAGE
--
-- In your files with patches to database, put whole logic in single
-- transaction, and use \_v.\* functions - usually \_v.register_patch() at
-- least to make sure everything is OK.
--
-- For example. Let's assume you have patch files:
--
-- ## 0001.sql:
--
-- ```
-- create table users (id serial primary key, username text);
-- ```
--
-- ## 0002.sql:
--
-- ```
-- insert into users (username) values ('depesz');
-- ```
-- To change it to use versioning you would change the files, to this
-- state:
--
-- 0000.sql:
--
-- ```
-- BEGIN;
-- select _v.register_patch('000-base', NULL, NULL);
-- create table users (id serial primary key, username text);
-- COMMIT;
-- ```
--
-- ## 0002.sql:
--
-- ```
-- BEGIN;
-- select _v.register_patch('001-users', ARRAY['000-base'], NULL);
-- insert into users (username) values ('depesz');
-- COMMIT;
-- ```
--
-- This will make sure that patch 001-users can only be applied after
-- 000-base.
--
-- # AVAILABLE FUNCTIONS
--
-- ## \_v.register_patch( TEXT )
--
-- Registers named patch, or dies if it is already registered.
--
-- Returns integer which is id of patch in \_v.patches table - only if it
-- succeeded.
--
-- ## \_v.register_patch( TEXT, TEXT[] )
--
-- Same as \_v.register_patch( TEXT ), but checks is all given patches (given as
-- array in second argument) are already registered.
--
-- ## \_v.register_patch( TEXT, TEXT[], TEXT[] )
--
-- Same as \_v.register_patch( TEXT, TEXT[] ), but also checks if there are no conflicts with preexisting patches.
--
-- Third argument is array of names of patches that conflict with current one. So
-- if any of them is installed - register_patch will error out.
--
-- ## \_v.unregister_patch( TEXT )
--
-- Removes information about given patch from the versioning data.
--
-- It doesn't remove objects that were created by this patch - just removes
-- metainformation.
--
-- ## \_v.assert_user_is_superuser()
--
-- Make sure that current patch is being loaded by superuser.
--
-- If it's not - it will raise exception, and break transaction.
--
-- ## \_v.assert_user_is_not_superuser()
--
-- Make sure that current patch is not being loaded by superuser.
--
-- If it is - it will raise exception, and break transaction.
--
-- ## \_v.assert_user_is_one_of(TEXT, TEXT, ... )
--
-- Make sure that current patch is being loaded by one of listed users.
--
-- If ```current_user``` is not listed as one of arguments - function will raise
-- exception and break the transaction.

BEGIN;

-- This file adds versioning support to database it will be loaded to.
-- It requires that PL/pgSQL is already loaded - will raise exception otherwise.
-- All versioning "stuff" (tables, functions) is in "_v" schema.

-- All functions are defined as 'RETURNS SETOF INT4' to be able to make them to RETURN literally nothing (0 rows).
-- >> RETURNS VOID<< IS similar, but it still outputs "empty line" in psql when calling.
CREATE SCHEMA IF NOT EXISTS _v;
COMMENT ON SCHEMA _v IS 'Schema for versioning data and functionality.';

CREATE TABLE IF NOT EXISTS _v.patches (
    patch_name  TEXT        PRIMARY KEY,
    applied_tsz TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by  TEXT        NOT NULL,
    requires    TEXT[],
    conflicts   TEXT[]
);
COMMENT ON TABLE _v.patches              IS 'Contains information about what patches are currently applied on database.';
COMMENT ON COLUMN _v.patches.patch_name  IS 'Name of patch, has to be unique for every patch.';
COMMENT ON COLUMN _v.patches.applied_tsz IS 'When the patch was applied.';
COMMENT ON COLUMN _v.patches.applied_by  IS 'Who applied this patch (PostgreSQL username)';
COMMENT ON COLUMN _v.patches.requires    IS 'List of patches that are required for given patch.';
COMMENT ON COLUMN _v.patches.conflicts   IS 'List of patches that conflict with given patch.';

CREATE OR REPLACE FUNCTION _v.register_patch( IN in_patch_name TEXT, IN in_requirements TEXT[], in_conflicts TEXT[], OUT versioning INT4 ) RETURNS setof INT4 AS $$
DECLARE
    t_text   TEXT;
    t_text_a TEXT[];
    i INT4;
BEGIN
    -- Thanks to this we know only one patch will be applied at a time
    LOCK TABLE _v.patches IN EXCLUSIVE MODE;

    SELECT patch_name INTO t_text FROM _v.patches WHERE patch_name = in_patch_name;
    IF FOUND THEN
        RAISE EXCEPTION 'Patch % is already applied!', in_patch_name;
    END IF;

    t_text_a := ARRAY( SELECT patch_name FROM _v.patches WHERE patch_name = any( in_conflicts ) );
    IF array_upper( t_text_a, 1 ) IS NOT NULL THEN
        RAISE EXCEPTION 'Versioning patches conflict. Conflicting patche(s) installed: %.', array_to_string( t_text_a, ', ' );
    END IF;

    IF array_upper( in_requirements, 1 ) IS NOT NULL THEN
        t_text_a := '{}';
        FOR i IN array_lower( in_requirements, 1 ) .. array_upper( in_requirements, 1 ) LOOP
            SELECT patch_name INTO t_text FROM _v.patches WHERE patch_name = in_requirements[i];
            IF NOT FOUND THEN
                t_text_a := t_text_a || in_requirements[i];
            END IF;
        END LOOP;
        IF array_upper( t_text_a, 1 ) IS NOT NULL THEN
            RAISE EXCEPTION 'Missing prerequisite(s): %.', array_to_string( t_text_a, ', ' );
        END IF;
    END IF;

    INSERT INTO _v.patches (patch_name, applied_tsz, applied_by, requires, conflicts ) VALUES ( in_patch_name, now(), current_user, coalesce( in_requirements, '{}' ), coalesce( in_conflicts, '{}' ) );
    RETURN;
END;
$$ language plpgsql;
COMMENT ON FUNCTION _v.register_patch( TEXT, TEXT[], TEXT[] ) IS 'Function to register patches in database. Raises exception if there are conflicts, prerequisites are not installed or the migration has already been installed.';

CREATE OR REPLACE FUNCTION _v.register_patch( TEXT, TEXT[] ) RETURNS setof INT4 AS $$
    SELECT _v.register_patch( $1, $2, NULL );
$$ language sql;
COMMENT ON FUNCTION _v.register_patch( TEXT, TEXT[] ) IS 'Wrapper to allow registration of patches without conflicts.';
CREATE OR REPLACE FUNCTION _v.register_patch( TEXT ) RETURNS setof INT4 AS $$
    SELECT _v.register_patch( $1, NULL, NULL );
$$ language sql;
COMMENT ON FUNCTION _v.register_patch( TEXT ) IS 'Wrapper to allow registration of patches without requirements and conflicts.';

CREATE OR REPLACE FUNCTION _v.unregister_patch( IN in_patch_name TEXT, OUT versioning INT4 ) RETURNS setof INT4 AS $$
DECLARE
    i        INT4;
    t_text_a TEXT[];
BEGIN
    -- Thanks to this we know only one patch will be applied at a time
    LOCK TABLE _v.patches IN EXCLUSIVE MODE;

    t_text_a := ARRAY( SELECT patch_name FROM _v.patches WHERE in_patch_name = ANY( requires ) );
    IF array_upper( t_text_a, 1 ) IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot uninstall %, as it is required by: %.', in_patch_name, array_to_string( t_text_a, ', ' );
    END IF;

    DELETE FROM _v.patches WHERE patch_name = in_patch_name;
    GET DIAGNOSTICS i = ROW_COUNT;
    IF i < 1 THEN
        RAISE EXCEPTION 'Patch % is not installed, so it can''t be uninstalled!', in_patch_name;
    END IF;

    RETURN;
END;
$$ language plpgsql;
COMMENT ON FUNCTION _v.unregister_patch( TEXT ) IS 'Function to unregister patches in database. Dies if the patch is not registered, or if unregistering it would break dependencies.';

CREATE OR REPLACE FUNCTION _v.assert_patch_is_applied( IN in_patch_name TEXT ) RETURNS TEXT as $$
DECLARE
    t_text TEXT;
BEGIN
    SELECT patch_name INTO t_text FROM _v.patches WHERE patch_name = in_patch_name;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patch % is not applied!', in_patch_name;
    END IF;
    RETURN format('Patch %s is applied.', in_patch_name);
END;
$$ language plpgsql;
COMMENT ON FUNCTION _v.assert_patch_is_applied( TEXT ) IS 'Function that can be used to make sure that patch has been applied.';

CREATE OR REPLACE FUNCTION _v.assert_user_is_superuser() RETURNS TEXT as $$
DECLARE
    v_super bool;
BEGIN
    SELECT usesuper INTO v_super FROM pg_user WHERE usename = current_user;
    IF v_super THEN
        RETURN 'assert_user_is_superuser: OK';
    END IF;
    RAISE EXCEPTION 'Current user is not superuser - cannot continue.';
END;
$$ language plpgsql;
COMMENT ON FUNCTION _v.assert_user_is_superuser() IS 'Function that can be used to make sure that patch is being applied using superuser account.';

CREATE OR REPLACE FUNCTION _v.assert_user_is_not_superuser() RETURNS TEXT as $$
DECLARE
    v_super bool;
BEGIN
    SELECT usesuper INTO v_super FROM pg_user WHERE usename = current_user;
    IF v_super THEN
        RAISE EXCEPTION 'Current user is superuser - cannot continue.';
    END IF;
    RETURN 'assert_user_is_not_superuser: OK';
END;
$$ language plpgsql;
COMMENT ON FUNCTION _v.assert_user_is_not_superuser() IS 'Function that can be used to make sure that patch is being applied using normal (not superuser) account.';

CREATE OR REPLACE FUNCTION _v.assert_user_is_one_of(VARIADIC p_acceptable_users TEXT[] ) RETURNS TEXT as $$
DECLARE
BEGIN
    IF current_user = any( p_acceptable_users ) THEN
        RETURN 'assert_user_is_one_of: OK';
    END IF;
    RAISE EXCEPTION 'User is not one of: % - cannot continue.', p_acceptable_users;
END;
$$ language plpgsql;
COMMENT ON FUNCTION _v.assert_user_is_one_of(TEXT[]) IS 'Function that can be used to make sure that patch is being applied by one of defined users.';

COMMIT;
