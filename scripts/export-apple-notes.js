#!/usr/bin/env osascript -l JavaScript

/**
 * Export Apple Notes to JSON via JXA (JavaScript for Automation)
 * Usage: ./scripts/export-apple-notes.js > notes.json
 */

function run(argv) {
  const Notes = Application('Notes');
  const output = [];
  
  // We'll focus on the "Notes" account (usually iCloud or Local)
  // You can list all accounts: Notes.accounts.name()
  
  // Get all notes from all accounts to be safe, or filter by specific folder
  // Be careful with large libraries; fetching properties can be slow.
  
  const accounts = Notes.accounts();
  
  for (const account of accounts) {
    const accountName = account.name();
    const notes = account.notes();
    
    // Iterate notes
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      try {
        // Essential properties
        const id = note.id();
        const name = note.name();
        const body = note.body(); // This is HTML
        const creationDate = note.creationDate();
        const modificationDate = note.modificationDate();
        
        output.push({
          id,
          account: accountName,
          title: name,
          htmlBody: body,
          created: creationDate ? creationDate.toISOString() : null,
          modified: modificationDate ? modificationDate.toISOString() : null
        });
      } catch (e) {
        // Skip note if access fails
      }
    }
  }
  
  return JSON.stringify(output, null, 2);
}