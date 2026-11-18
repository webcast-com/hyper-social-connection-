import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyOrder, quoteIdent, rowsPerInsert, type ForeignKey } from '../../src/lib/copy-plan';

const fk = (child: string, parent: string, column: string, nullable = false): ForeignKey => ({
  child,
  parent,
  columns: [column],
  nullable,
});

function assertParentsFirst(tables: string[], keys: ForeignKey[], deferred: ForeignKey[]) {
  for (const key of keys) {
    if (deferred.includes(key) || key.child === key.parent) continue;
    assert.ok(
      tables.indexOf(key.parent) < tables.indexOf(key.child),
      `${key.parent} must come before ${key.child}`,
    );
  }
}

test('a referenced table is copied before the tables that point at it', () => {
  const keys = [
    fk('posts', 'users', 'user_id'),
    fk('comments', 'posts', 'post_id'),
    fk('comments', 'users', 'user_id'),
    fk('likes', 'posts', 'post_id'),
    fk('likes', 'users', 'user_id'),
    fk('poll_votes', 'poll_options', 'option_id'),
    fk('poll_options', 'polls', 'poll_id'),
    fk('polls', 'posts', 'post_id'),
  ];
  const tables = ['likes', 'poll_votes', 'comments', 'polls', 'users', 'poll_options', 'posts', 'standalone'];
  const order = copyOrder(tables, keys);
  assert.deepEqual([...order.tables].sort(), [...tables].sort(), 'every table appears once');
  assertParentsFirst(order.tables, keys, order.deferred);
  assert.deepEqual(order.deferred, []);
  assert.deepEqual(order.problems, []);
});

test('the order does not depend on the order the tables are listed in', () => {
  const keys = [fk('b', 'a', 'a_id'), fk('c', 'a', 'a_id'), fk('d', 'c', 'c_id')];
  assert.deepEqual(copyOrder(['d', 'c', 'b', 'a'], keys).tables, copyOrder(['a', 'b', 'c', 'd'], keys).tables);
});

test('a table that points at itself has that column filled in afterwards', () => {
  // posts.repost_of_id: a repost can have a lower id than the post it shares.
  const self = fk('posts', 'posts', 'repost_of_id', true);
  const keys = [fk('posts', 'users', 'user_id'), self];
  const order = copyOrder(['posts', 'users'], keys);
  assert.deepEqual(order.tables, ['users', 'posts']);
  assert.deepEqual(order.deferred, [self]);
  assert.deepEqual(order.problems, []);
});

test('two tables that point at each other are untangled through the optional side', () => {
  const required = fk('members', 'groups', 'group_id');
  const optional = fk('groups', 'members', 'owner_member_id', true);
  const order = copyOrder(['groups', 'members'], [required, optional]);
  assert.deepEqual(order.deferred, [optional]);
  assert.deepEqual(order.tables, ['groups', 'members']);
  assert.deepEqual(order.problems, []);
});

test('a loop of required references is reported, not guessed at', () => {
  const order = copyOrder(['a', 'b', 'c'], [fk('a', 'b', 'b_id'), fk('b', 'a', 'a_id')]);
  assert.equal(order.problems.length, 1);
  assert.match(order.problems[0], /a, b/);
  assert.deepEqual([...order.tables].sort(), ['a', 'b', 'c'], 'every table is still listed');
});

test('an insert never exceeds the bind-parameter limit', () => {
  for (const columns of [1, 2, 16, 119, 120, 121, 500, 70_000]) {
    const rows = rowsPerInsert(columns);
    assert.ok(rows >= 1 && rows <= 500, `${columns} columns -> ${rows} rows`);
    if (columns <= 60_000) assert.ok(rows * columns <= 65_535, `${columns} columns -> ${rows * columns} parameters`);
  }
  assert.equal(rowsPerInsert(16), 500);
  assert.equal(rowsPerInsert(200), 300);
});

test('identifiers are quoted', () => {
  assert.equal(quoteIdent('users'), '"users"');
  assert.equal(quoteIdent('odd"name'), '"odd""name"');
});
