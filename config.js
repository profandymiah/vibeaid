// Vibe Aid settings. Uses the shared "vibeaid" Supabase project (all tables start with va_).
// Fill these in from Supabase > Project Settings > API (see SETUP.md).
window.VIBE_AID_CONFIG = {
  // Project URL, e.g. "https://abcdefghijkl.supabase.co"
  SUPABASE_URL: "https://ynqfrqlagcqxoadjvtfy.supabase.co",
  // The "anon public" key. It is safe to publish: the database rules protect the data.
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlucWZycWxhZ2NxeG9hZGp2dGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MTY1NTEsImV4cCI6MjEwODQ5MjU1MX0.FOIH363KJ4IZng0vNNvxBhzwy7D9_eXTv4UwDPtQCUM",
  // Set to true after turning on GitHub sign-in in Supabase (SETUP.md, Part 1b).
  GITHUB_SIGNIN: false,
  // Shown in the footer. Leave empty ("") to hide it.
  CONTACT_EMAIL: "",
  // While Supabase isn't connected, the site shows clearly-labelled example projects.
  SHOW_EXAMPLES_WHEN_EMPTY: true
};
