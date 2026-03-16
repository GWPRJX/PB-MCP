import { describe, it } from 'vitest';

describe('App role is non-superuser with no BYPASSRLS (INFRA-05)', () => {
  it.todo('app_login connected user is not a superuser');
  it.todo('app_user role has rolbypassrls = false');
  it.todo('app_login role has rolbypassrls = false');
  it.todo('app_login cannot execute DDL (CREATE TABLE raises permission denied)');
});
