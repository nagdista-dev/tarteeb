Fix the issue where the “Download Current Day” and “Download Previous Day” buttons are not working.

Requirements:

- Investigate why both download buttons are not triggering the export action.
- Ensure clicking either button correctly generates and downloads the Markdown file for the selected day.
- Current Day download must export today's data using the correct export template.
- Previous Day download must export the selected previous day using the same template and rules as Current Day export.
- Ensure no UI errors or silent failures occur when the buttons are clicked.
- Add proper error handling so that if export fails, a clear error message is shown to the user.
- Verify that file generation, formatting, and download triggering work consistently across both buttons.
- Ensure the fix does not break other export-related features or app performance.
add all files and commit don't push to github only add files and commit 