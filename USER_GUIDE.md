# Sakhi Sang Attendance Tracker — User Guide

> **Plain English guide for all users: Super Admins, Coordinators, Facilitators, and Attendance Volunteers.**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Getting Started — Login & Signup](#2-getting-started--login--signup)
3. [Who Can Do What — Access Table](#3-who-can-do-what--access-table)
4. [Where Everything Lives — Interface Map](#4-where-everything-lives--interface-map)
5. [Feature Deep-Dive](#5-feature-deep-dive)
   - [5A. Home Dashboard](#5a-home-dashboard)
   - [5B. Managing Devotees](#5b-managing-devotees)
   - [5C. Calling (Weekly Follow-Up)](#5c-calling-weekly-follow-up)
   - [5D. Attendance Marking](#5d-attendance-marking)
   - [5E. Activities — Books, Service, Registration, Donation](#5e-activities--books-service-registration-donation)
   - [5F. Reports & Analytics](#5f-reports--analytics)
   - [5G. Care Tab — Following Up on Absent Devotees](#5g-care-tab--following-up-on-absent-devotees)
   - [5H. Events](#5h-events)
   - [5I. Calling Management (Super Admin)](#5i-calling-management-super-admin)
6. [The Filter Bar — Controlling What You See](#6-the-filter-bar--controlling-what-you-see)
7. [Admin Panel — Managing Users & Sessions](#7-admin-panel--managing-users--sessions)
8. [Excel Import & Export](#8-excel-import--export)
9. [Tips, Warnings & Common Questions](#9-tips-warnings--common-questions)

---

## 1. System Overview

The **Sakhi Sang Attendance Tracker** is a web app built for the coordinators and facilitators of the Sakhi Sang women's devotee group. It helps you:

- Keep a **database of all devotees** — their contact details, team, spiritual practices, family background, and more.
- **Track weekly calling** — who called whom, who said they would come, and whether they actually came.
- **Mark attendance** at Sunday sessions live on your phone or computer.
- **Record activities** throughout the week — books distributed, donations collected, registrations, and service.
- **See reports and charts** to understand how your team is performing.
- **Identify who needs care** — devotees who are absent, inactive, or said they would come but didn't.

Everything is organized by **team** (e.g., Champaklata, Lalita, Rangadevi). Each coordinator manages their own team, while Super Admins can see everything across all teams.

> **Tip:** This app works on your phone browser too — no installation needed. Just open the link and log in.

---

## 2. Getting Started — Login & Signup

### Signing Up for the First Time

1. Open the app link in your browser.
2. Click **"Sign Up"** on the login screen.
3. Enter your **name**, **email address**, and a **password**.
4. Click **"Request Access"**.
5. You will see a message: **"Your request is awaiting approval."** — this means a Super Admin needs to approve your account before you can log in.

> **Note:** You cannot use the app until a Super Admin approves you. If you've been waiting too long, contact your Super Admin directly.

### Logging In

1. Open the app link.
2. Enter your **email** and **password**.
3. Click **"Login"**.
4. The app will open to your **Home/Dashboard** tab.

### If Your Account Was Rejected

You will see the message: **"This account was not approved."** Contact your Super Admin to find out why and resubmit if needed.

![Screenshot: Login screen with email, password fields and Login/Sign Up buttons]

---

## 3. Who Can Do What — Access Table

There are three types of accounts in this app:

| What You Want to Do | Super Admin | Coordinator (Team Admin) | Facilitator / Attendance Volunteer |
|---|:---:|:---:|:---:|
| See all teams' data | ✅ | ❌ (own team only) | ❌ (own team only) |
| Add / edit devotees | ✅ | ✅ | ❌ |
| Mark devotees as "Not Interested" or remove them | ✅ | ❌ | ❌ |
| Do weekly calling & submit calling status | ✅ | ✅ | ❌ |
| Mark attendance at Sunday sessions | ✅ | ✅ | ✅ (if enabled) |
| Log books, donations, registrations, service | ✅ | ✅ | ❌ |
| View reports and care alerts | ✅ | ✅ | ❌ |
| Manage events | ✅ | ✅ | ❌ |
| Approve / reject new user signups | ✅ | ❌ | ❌ |
| Configure Sunday sessions (date, topic) | ✅ | ❌ | ❌ |
| Clear / delete data | ✅ | ❌ | ❌ |
| Manage all users' roles | ✅ | ❌ | ❌ |
| View Calling Management grid | ✅ | ❌ | ❌ |

> **Tip for Super Admins:** You can also grant an Attendance Volunteer access to mark attendance across **all** teams by enabling "Att. Seva" in the Admin Panel.

---

## 4. Where Everything Lives — Interface Map

When you log in, you see a row of tabs at the top (or at the bottom on a phone). Here is what each tab is for:

| Tab Name | What It Does |
|---|---|
| **Home / Dashboard** | Quick summary stats + fast-entry shortcuts for today's activities |
| **Devotees** | Full database of all devotees — add, edit, search, view profiles |
| **Calling** | Weekly calling tracker — record who you called, if they're coming, why not |
| **Attendance** | Mark who came on Sunday; see past attendance sheets |
| **Books** | Log books distributed this week |
| **Service** | Log service done by devotees |
| **Registration** | Log event or programme registrations |
| **Donation** | Log donations received |
| **Care** | Alerts for absent, inactive, or at-risk devotees |
| **Events** | Create and manage special events; track who attended |
| **Calling Mgmt** | (Super Admin only) Overview of all teams' calling progress |

![Screenshot: Top navigation bar showing all tab names]

### The Filter Bar (Below the Tabs)

Just below the tab row, there is a **Filter Bar** with three buttons:

- **Session** — which Sunday you are looking at (defaults to the latest configured Sunday)
- **Team** — which team's data to show (Coordinators are locked to their own team)
- **Calling By** — filter by which coordinator is doing the calling

Changing any of these filters will instantly update the data in whichever tab you are on.

---

## 5. Feature Deep-Dive

---

### 5A. Home Dashboard

The Home tab is your **quick-action hub**. It shows you a greeting ("Hare Krishna, [Your Name]!") and tiles you can tap to do common tasks without navigating away.

#### Quick-Entry Buttons

At the top of the Home tab, you'll find shortcut buttons to open fast-entry drawers:

| Button | What It Opens |
|---|---|
| **Attendance Report** | A summary table of today's calling and attendance numbers per team |
| **Book Distribution** | A form to quickly log books given out today |
| **Donation** | A form to log a donation received |
| **Registration** | A form to log a registration |
| **Service** | A form to log service done by a devotee |

#### How to Log a Book Entry from Home

1. Tap **"Books"** (or the Book Distribution button) on the Home tab.
2. A panel slides up from the bottom.
3. In the **Devotee** field, type the devotee's name or mobile number to search. Select them from the list.
4. The **Team** field will fill in automatically.
5. Set the **Date** (defaults to today).
6. Enter the **Quantity** of books.
7. Tap **"Save Entry"**.
8. The entry is saved and a summary panel below shows recent entries.

> The same steps apply for **Service**, **Registration**, and **Donation** — just tap the relevant button.

> **Tip:** The Attendance Report quick button shows you a real-time snapshot of calling vs attendance per team — useful before the Sunday session starts.

---

### 5B. Managing Devotees

The **Devotees tab** is where all devotee information is stored and managed.

#### Searching for a Devotee

1. Go to the **Devotees** tab.
2. Use the **search box** at the top to type a name or mobile number.
3. The list filters instantly as you type.
4. You can also filter by **status** (Most Serious, Serious, New Devotee, Inactive, etc.) using the status filter.

![Screenshot: Devotee list with search box and status filter dropdown]

#### Adding a New Devotee

1. Go to the **Devotees** tab.
2. Click the **"+ Add Devotee"** button (usually in the top-right area).
3. A form opens with **5 sections** (tabs inside the form):

   **Section 1 — Personal Identity**
   - Full Name *(required)*
   - Mobile Number *(required, 10 digits)*
   - Alternate Mobile
   - Residential Address
   - Date of Birth
   - Email

   **Section 2 — Team & Status**
   - Team (select from dropdown — e.g., Champaklata, Lalita, etc.)
   - Devotee Status: Most Serious / Serious / Expected to be Serious / New Devotee / Inactive
   - Date of Joining
   - Reference By *(who introduced them — search from existing devotees)*
   - Facilitator *(who takes care of them)*
   - Calling By *(who calls them each week — must have a system login)*

   **Section 3 — Professional Profile**
   - Education / Qualification
   - Profession / Occupation

   **Section 4 — Sadhana & Practices**
   - Daily Chanting Rounds
   - Reading, Hearing habits
   - Wears Tilak (Yes/No), Kanthi (Yes/No), Gopi Dress (Yes/No)
   - Plays Instrument (if Yes, enter instrument name)
   - Attends Kirtan Classes (Yes/No)

   **Section 5 — Social & Family**
   - Total Family Members
   - Family Members attending class
   - Family's Attitude Towards Devotion
   - Hobbies & Interests

4. Fill in at least the required fields (Name, Mobile) and click **"Save"**.

> **Tip:** A colour circle on the profile shows how complete the profile is — red means less than 50% filled, green means 80%+. Try to fill as much as possible.

#### Viewing a Devotee's Profile

1. Click on any devotee's card in the list.
2. Their full profile opens in a pop-up with all 5 sections plus a 6th section showing **devotees they referred**.
3. From here you can also see their **attendance history** and **calling history**.

#### Editing a Devotee's Profile

1. Open their profile (click on their name in the list).
2. Click the **"Edit"** button.
3. Update any field and click **"Save"**.

> **Technical Warning:** Only Coordinators and Super Admins can edit profiles. All changes are tracked in an audit history — nothing is ever silently overwritten.

#### Marking a Devotee as "Not Interested"

> This is for devotees who no longer wish to be contacted.

1. Open the devotee's profile.
2. Click **"Not Interested"** (only Super Admins can see this button).
3. Confirm the action.
4. The devotee moves to a separate "Not Interested" list and is excluded from all calling counts.

> **Note:** This does NOT delete the devotee. Their record is preserved. A Super Admin can reverse this if needed.

---

### 5C. Calling (Weekly Follow-Up)

The **Calling tab** is where you record the outcome of your weekly calls to devotees.

#### Understanding the Calling Tab

Each week, before Sunday's session, coordinators are expected to call each devotee in their list and record:
- **Are they coming this Sunday?** (Yes / No)
- **If no, why?** (Didn't pick up, Out of station, Exams, Not interested this week, etc.)

The calling window opens on a specific day (set by the Super Admin) and closes at **9 PM** on the calling deadline.

![Screenshot: Calling tab showing devotee list with Coming toggle and Reason dropdown]

#### How to Update Calling Status

1. Go to the **Calling** tab.
2. You'll see your list of devotees.
3. For each devotee:
   - If they said **"Yes, I'm coming"** → tap the **"Mark Yes"** button. It turns green and shows "Coming ✓".
   - If they are **not coming**, click the row and select a **Reason** from the dropdown:
     - Did not pick call
     - Incoming not available
     - Wrong number
     - Out of station *(enter the date they return)*
     - Exams *(enter the date they return)*
     - Shifted to online class
     - Festival Calling
     - Not Interested (this week)

4. You can also add a short note in the Notes field.

> **Tip:** You can see at the top of the tab how many are Confirmed, Not Reached, Unavailable, etc. These update in real time as you fill in the list.

#### Submitting Your Calling

Once you've called everyone, you must officially **submit** your calling:

1. At the bottom of the Calling tab, look for the submission bar: **"Done calling for [DATE]? [Submit Calling]"**
2. Click **"Submit Calling"**.
3. You'll see a confirmation message with a timestamp.

> **Technical Warning:** Submit before **9 PM** on the deadline. If you submit after 9 PM, it will be marked as **"Late"** in reports. The initial submission time is locked — it won't change if you update calling status later.

#### Viewing Calling Reports

There are two report sub-tabs inside Calling:

1. **Weekly Report** — Shows each team's calling summary (total called, said yes, actually came). Click **"Export"** to download as Excel.
2. **Accuracy Report** — Shows how many devotees said they would come but didn't attend. Useful for improving calling quality.

---

### 5D. Attendance Marking

The **Attendance tab** is used on Sunday to mark who is present at the session.

#### Before the Session — What the Super Admin Does

A Super Admin must configure the session first:
1. Go to the **Attendance tab**.
2. Click **"Configure Sunday"** (or the settings gear icon).
3. Enter:
   - **Calling Date** — the day calling was done
   - **Session / Attendance Date** — the actual Sunday
   - **Topic** (optional)
   - **Speaker Name** (optional)
   - **Session Type** — Regular or Festival
4. Save. The session is now active.

#### Marking Attendance Live (on Sunday)

1. Go to the **Attendance tab**.
2. You'll see a list of devotees — those who said "Yes" on calling appear with a **"Confirmed"** badge.
3. As each devotee arrives, find their card and tap **"Present"**.
4. The button changes to show **"P [Time]"** — the time they were marked.
5. If you marked someone by mistake, tap **"Undo"**.

At the top, you'll see 4 live counters updating:
- **Total Confirmed** — how many said they would come
- **Present** — how many have been marked so far
- **New** — first-timers today
- **Total Present** — combined count

![Screenshot: Attendance tab with devotee cards showing Present button and live counters]

> **Tip:** If a new devotee arrives who is not in the system, you can register them on the spot — there is an option to add a new devotee directly from the Attendance tab.

#### Viewing Past Attendance

1. Change the **Session** in the Filter Bar to a past date.
2. The Attendance tab will switch to a historical view showing a full attendance sheet.
3. The sheet is colour-coded:
   - **Light blue** = 30+ sessions attended
   - **Light green** = 15+ sessions
   - **Light yellow** = 5+ sessions

---

### 5E. Activities — Books, Service, Registration, Donation

Each of these four tabs works the same way. They have two sub-sections:

#### Logging a New Entry

1. Go to the relevant tab (e.g., **Books**).
2. You'll see a **"Log Entry"** section at the top.
3. Fill in:
   - **Devotee** — search and select the devotee (not required for Donation)
   - **Team** — auto-fills from the devotee; can be changed
   - **Date** — defaults to today
   - The main field:
     - **Books**: Quantity (how many books)
     - **Service**: Description of the service done
     - **Registration**: Count (how many)
     - **Donation**: Amount in ₹ + optional Note
4. Click **"Save Entry"**.
5. The entry appears in the **Recent Entries** list below.

#### Viewing Reports

1. Scroll down (or click the **"Reports"** sub-tab).
2. Set the **From** and **To** dates for the date range you want.
3. Click **"Refresh"** to update.
4. You'll see:
   - Summary tiles: Grand Total, Number of Entries, Date Range
   - A table broken down by team (click a team row to expand and see individual entries)
5. Click **"Export Excel"** to download the report.

---

### 5F. Reports & Analytics

The **Home tab's Dashboard** and the Reports sections inside each tab give you a full picture of how things are going.

#### Dashboard Tiles (Home Tab)

At the top of the Home tab, six tiles show this week's numbers at a glance:

| Tile | What It Shows |
|---|---|
| **Attended** | How many came out of the calling list |
| **Calling Accuracy** | % of "Yes" responses that actually attended |
| **Books** | Books distributed this week |
| **Services** | Services logged this week |
| **Registrations** | Registrations logged this week |
| **Donation** | Total donations collected (₹) |

#### Coordinator Performance Grid (Reports Section)

The Reports tab shows a detailed grid of each team / coordinator:

| Column | Meaning |
|---|---|
| Team | Team name |
| Called | How many devotees were called |
| Yes | How many said they would come |
| Came | How many actually attended |
| Target | The attendance target set for the team |
| % | Achievement percentage |
| Books | Books logged |
| Service | Service entries |
| Reg. | Registrations |
| Donation ₹ | Total donation amount |

Click on any number in this grid to see the **list of devotees** behind that number.

#### Attendance Reports (Period Analysis)

1. Go to the **Attendance tab** and look for the Reports section.
2. Choose a period:
   - **Single Session** — just one Sunday
   - **Month** — all Sundays in a calendar month
   - **Quarter** — 3 months
   - **FY** — full financial year (April to March)
3. Select sub-tabs for different views:
   - **Attendance Sheet** — full per-devotee grid showing calling status and attendance for each session
   - **Late Comers** — devotees who arrived after a certain time
   - **New Comers** — first-time attendees
   - **Serious Analysis** — breakdown by devotee status (Most Serious, Serious, etc.)
   - **Team Leaderboard** — ranks teams by attendance achievement (🥇 🥈 🥉 medals)
   - **Trends** — a line chart of attendance numbers over time

![Screenshot: Team Leaderboard tab with medal rankings]

---

### 5G. Care Tab — Following Up on Absent Devotees

The **Care tab** is a set of automatic alerts to help you follow up with devotees who need attention.

It shows **5 alert cards** based on the session selected in the Filter Bar:

| Alert | Who It Shows |
|---|---|
| **Absent This Week** | Active devotees who did not attend this session |
| **Absent 2+ Weeks** | Devotees missing for two consecutive Sundays |
| **Returning Newcomers** | Devotees who came for the first time after a gap |
| **Inactivity Alerts** | Devotees who haven't attended in 3+ weeks |
| **Said Coming — Didn't Come** | Confirmed "Yes" on calling but absent on Sunday |

#### How to Use the Care Tab

1. Go to the **Care** tab.
2. The current session's data loads automatically.
3. Click on any alert card to see the full list of devotees.
4. Click a devotee's name in the list to open their profile.
5. Click **"Export"** to download the list as an Excel file (e.g., for use in WhatsApp follow-up).

> **Tip:** Use the "Said Coming — Didn't Come" list to talk to coordinators about improving calling accuracy.

---

### 5H. Events

The **Events tab** lets you create and manage special events (other than regular Sundays).

#### Creating an Event

1. Go to the **Events** tab.
2. Click **"+ New Event"**.
3. Enter:
   - **Event Name**
   - **Date**
   - **Description** (optional)
4. Save.

#### Adding Devotees to an Event

1. Open the event (click its card).
2. Use the search box to find devotees.
3. Click **"Add"** next to each devotee's name to register them for the event.
4. Removed from the event? Click the **"Remove"** button next to their name.

#### Exporting Event Attendance

1. Open the event.
2. Click **"Export"** to download the list of registered devotees as an Excel file.

---

### 5I. Calling Management (Super Admin Only)

The **Calling Mgmt tab** is only visible to Super Admins. It gives a bird's-eye view of all teams' calling progress across the current week.

- See which teams have submitted calling
- See which coordinators are still pending
- Track submission times and identify late submissions

---

## 6. The Filter Bar — Controlling What You See

The **Filter Bar** (the row of three buttons just below the tabs) is the most important control in the app. Changing these filters changes what every tab shows.

![Screenshot: Filter Bar with Session, Team, and Calling By chips]

### Session Filter

- Shows the **date of the current Sunday session**.
- Click it to open a dropdown of all past sessions.
- Changing it will show data for that past session — useful for reviewing old attendance or calling data.
- Click the **✕** on the chip to go back to the latest session.

### Team Filter

- Shows **"All Teams"** by default (for Super Admins).
- Coordinators are locked to their own team and cannot change this.
- Super Admins can click to filter to one team.

### Calling By Filter

- Shows **"All Callers"** by default.
- Click to narrow the view to a specific coordinator's list.

### The Caption Line

Below the three chips, a line of text tells you exactly what you're looking at, for example:
> *"Showing all teams, called by Radhika, for Sun 27 Apr 2026"*

---

## 7. Admin Panel — Managing Users & Sessions

The **Admin Panel** is only accessible to Super Admins. Look for the settings or admin icon in the top-right corner of the screen.

### Approving New User Signups

When someone signs up, a **badge with a number** appears on the admin icon.

1. Click the admin icon → **"Sign-up Requests"**.
2. You'll see a list of pending requests with:
   - Name and email
   - When they requested access
3. For each request:
   - Select their **Role**: Facilitator / Coordinator / Super Admin
   - Select their **Team**
   - Click **"Approve"** (green) or **"Reject"** (red)

> **Technical Warning:** Until you approve a signup, the user cannot log in — they will remain on the "Awaiting Approval" screen.

### Managing Existing Users

1. Admin icon → **"User Management"**.
2. Search for a user by name.
3. Click their row to open their settings:
   - Change **Role** (Facilitator / Coordinator / Super Admin)
   - Change **Team**
   - Add a **Position** (free text, e.g., "Facilitator")
   - Enable **Att. Seva** — allows this user to mark attendance across all teams
   - **Remove** the user (use with caution)

### Configuring a Sunday Session

Before each Sunday, a Super Admin must configure the session:

1. Admin icon → **"Session Configuration"**.
2. Fill in:
   - **Calling Date** — the day coordinators should complete calling
   - **Attendance Date** — the actual Sunday
   - **Topic** and **Speaker** (optional)
   - **Session Type** — Regular or Festival
3. Click **"Save Session"**.

### Editing Past Sessions

1. Admin icon → **"Session Management"**.
2. A table shows all past sessions with dates and attendance counts.
3. Click **"Edit"** on any row to update the topic, or mark the session as **Cancelled**.

> **Note:** Marking a session as cancelled does not delete attendance records. Attendance marking is still allowed on cancelled sessions.

### Clearing Data (Danger Zone)

1. Admin icon → **"Clear Data"**.
2. Three options are available:
   - **Clear by Date** — removes all attendance and calling data for one specific Sunday.
   - **Clear by Team + Date** — removes data for one team on one Sunday.
   - **Clear ALL Data** — removes everything (requires typing **"DELETE ALL"** to confirm).

> **Technical Warning:** Clearing data is permanent and cannot be undone. Always double-check before confirming.

---

## 8. Excel Import & Export

The app supports importing and exporting devotee data as Excel files.

### Exporting

Most lists and reports have an **"Export"** or **"Export Excel"** button. Click it to download the data as a formatted `.xlsx` file. Currency is shown in Indian Rupees (₹) and dates are in DD-MM-YYYY format.

### Importing Devotees

If you have a spreadsheet of devotees to add in bulk:

1. Go to the **Devotees** tab.
2. Look for the **"Import"** button.
3. Select your Excel file.
4. The app will:
   - Match columns to devotee fields
   - Detect possible duplicates (by name + mobile number)
   - Show you a confirmation screen before writing anything
5. Review the list and confirm.

> **Technical Warning:** Duplicates are detected by **name + mobile number together**. If a devotee exists with the same name but a different mobile number, they will be treated as a different person.

---

## 9. Tips, Warnings & Common Questions

### Tips

> **Tip — Use the Filter Bar first:** Before doing any data entry, check that the Session, Team, and Calling By filters are set correctly. Everything you enter will be filed under these filters.

> **Tip — Mobile-friendly:** The app works on your phone browser. Open it on Chrome or Safari and tap the "Add to Home Screen" option to use it like an app.

> **Tip — Profile completeness:** The coloured circle on a devotee's profile card shows how complete their profile is. Green = most fields filled. Try to fill all fields when first adding a devotee.

> **Tip — Calling before 9 PM:** Always submit your calling by 9 PM on the calling deadline day. Late submissions are flagged in reports and visible to Super Admins.

> **Tip — Undo attendance quickly:** If you marked the wrong person as present, tap "Undo" immediately. You can undo any attendance mark.

### Technical Warnings

> **Warning — Don't use the browser's back button:** This app is a single page — using the browser's back button may not work as expected. Use the tabs at the top to navigate.

> **Warning — Calling submission is time-stamped:** Once you click "Submit Calling," the submission time is locked. Even if you update calling statuses later, the original submission time stays fixed. Reports use this time to check for late submissions.

> **Warning — Team names must match exactly:** When importing data from Excel, team names must match exactly (e.g., "Vishakha" not "Visakha"). Mismatches will result in incorrect team assignment.

> **Warning — Cleared data cannot be recovered:** The "Clear Data" option in the Admin Panel permanently deletes records. There is no undo. Only Super Admins can do this and multiple confirmations are required.

> **Warning — Profile images have a 50 KB size limit:** When uploading a profile photo in "Edit Profile," keep the file under 50 KB.

### Common Questions

**Q: I can't see some tabs — is something wrong?**
A: No. The tabs you see depend on your role. Coordinators and Facilitators have fewer tabs than Super Admins. This is by design.

**Q: I updated a calling status but it still shows the old value — is it saved?**
A: Changes are saved as soon as you make them — no "Save" button is needed on individual calling rows. If you see the old value, try refreshing the filter or switching tabs and coming back.

**Q: A devotee isn't showing up in my calling list — why?**
A: Check that the Session and Team filters are correct. Also check if the devotee is marked "Inactive" or "Not Interested" — those are excluded from the calling list.

**Q: The app is showing old data even after I made changes — what should I do?**
A: Try clearing your browser cache or doing a hard refresh (Ctrl + Shift + R on Windows, Cmd + Shift + R on Mac). This forces the app to reload with the latest data.

**Q: Can two people use the app at the same time?**
A: Yes. Multiple people can be logged in simultaneously. However, if two people mark attendance or update calling on the same devotee at the same time, the last save wins.

---

*This guide was generated from the Sakhi Sang Attendance Tracker codebase. For technical issues, contact your Super Admin.*
