import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const members=sqliteTable('members',{email:text('email').primaryKey(),userId:text('user_id').unique(),name:text('name').notNull(),role:text('role').notNull(),bu:text('bu').notNull().default(''),active:integer('active').notNull().default(1)});
export const tickets=sqliteTable('tickets',{id:text('id').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(1),mutation:text('mutation').notNull()});
export const events=sqliteTable('events',{id:text('id').primaryKey(),ticketId:text('ticket_id').notNull(),at:text('at').notNull(),actor:text('actor').notNull(),actorId:text('actor_id').notNull(),text:text('text').notNull()});
export const config=sqliteTable('config',{id:text('id').primaryKey(),data:text('data').notNull()});
export const notices=sqliteTable('notices',{id:text('id').primaryKey(),email:text('email').notNull(),ticketId:text('ticket_id').notNull(),text:text('text').notNull(),at:text('at').notNull(),read:integer('read').notNull().default(0)});
export const files=sqliteTable('files',{id:text('id').primaryKey(),ticketId:text('ticket_id').notNull(),name:text('name').notNull(),size:integer('size').notNull(),mime:text('mime').notNull(),key:text('key').notNull(),by:text('by').notNull(),candidateId:text('candidate_id')});

export const loginLimits=sqliteTable('login_limits',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),windowStart:integer('window_start').notNull()});

export const staffLogins=sqliteTable('staff_logins',{email:text('email').primaryKey(),username:text('username').unique(),passwordHash:text('password_hash').notNull(),version:integer('version').notNull().default(1)});

export const ticketCounters=sqliteTable('ticket_counters',{prefix:text('prefix').primaryKey(),value:integer('value').notNull()});
export const ticketIdAliases=sqliteTable('ticket_id_aliases',{oldId:text('old_id').primaryKey(),newId:text('new_id').notNull()});
