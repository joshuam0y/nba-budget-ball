import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://vfbnofrfctprnbnduxrj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYm5vZnJmY3Rwcm5ibmR1eHJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODMwMjUsImV4cCI6MjA4NzY1OTAyNX0.S941IdN_DnyYkDgr8G1yHSirJpb0ZgAHxQWfUpQVb8I'
);