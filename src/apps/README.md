# Apps structure

Public app entry folders:

- `Scoreboard/`
- `Seating/`
- `Messages/`
- `Profile/`
- `Settings/`

The current `*App` folders/files are kept as legacy implementation paths while the project is being refactored safely. New imports should prefer the public entry folders above.

Next migration steps:

1. Move each app implementation into its public folder.
2. Keep temporary re-export files for compatibility.
3. Delete legacy `*App` paths after imports are fully migrated and build is checked.
