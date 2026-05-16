-- Run this in your Supabase SQL editor
create table keys (
  key        text primary key,
  expiry     bigint not null,         -- Unix ms timestamp, -1 = lifetime
  note       text,
  created_at bigint not null,
  created_by text,                    -- Discord user ID of whoever generated it
  redeemed_by text default null       -- Discord user ID of whoever redeemed it
);
