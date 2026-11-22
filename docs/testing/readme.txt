PC-TOUCH — WINDOWS x64 TESTER QUICK START (WINDOWS 11 REFERENCE)
Client version: 3.0.0-rc.12-repair.6. This build is experimental.
There is no validated installer or portable package; these steps run from source.

1. INSTALL NODE.JS
   Download Node.js 24 for Windows x64 from the official site:
   https://nodejs.org/en/download
   Select the 24.x line (tested: 24.22.3), the .msi installer, and npm.
   Close and reopen PowerShell/Terminal after installation.
   VS Code and Git are not required to run a complete source ZIP.

2. EXTRACT THE PROJECT
   Use the complete source ZIP supplied by the maintainer, or choose
   Code > Download ZIP on https://github.com/falcie1337/PC-Touch at the
   requested test revision. A patch-only ZIP is not a complete project.
   Extract it to a folder you own, such as C:\Projects\PC-Touch.
   Open the inner folder containing both package.json and yarn.lock.
   In File Explorer, type powershell in the address bar and press Enter.

3. CHECK NODE AND RUN THE COMMANDS
   First run: node --version
   It should begin with v24. Then run ONE line at a time and wait for it:

   npx.cmd --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts
   npx.cmd --yes yarn@1.22.22 test
   npx.cmd --yes yarn@1.22.22 prepare:desktop
   npx.cmd --yes yarn@1.22.22 dev

   If a step fails, stop there and send the error to the maintainer.
   The first preparation needs internet and may take several minutes.
   The "Ignored scripts due to flag" install warning is expected.
   Keep the terminal open. The app window is still named Lindo in this build.

4. NEXT LAUNCHES
   Open PowerShell in the same folder and run only:
   npx.cmd --yes yarn@1.22.22 dev
   To stop: close Lindo and press Ctrl+C in the terminal.

5. IF SOMETHING FAILS
   - "node/npx not recognized": reopen the terminal; check Node 24 and npm.
   - "package.json not found": you are in the wrong directory.
   - Python, node-gyp, MSBuild, or .node module error: share the complete
     error. Python/Build Tools may be needed if native compilation is required;
     do not install them preemptively if prepare:desktop succeeded.
   - Black screen/game error: press Ctrl+Shift+I, open Console, and copy the
     first relevant error. Say what action triggered it and how many tabs were
     open. Do not erase app data to troubleshoot; it may contain guest access.

When reporting a bug, include version, action, expected result, observed
result, and error message. Remove passwords, cookies, tokens, login codes,
and personal information from logs or screenshots. Sign in only in the Ankama
window; never send your credentials to the maintainer.

PC-Touch is independent of Ankama. See README.md for status, limitations, and
the official usage policy. Thank you for helping test the project!
