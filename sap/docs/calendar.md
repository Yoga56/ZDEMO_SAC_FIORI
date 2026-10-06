# Planning calendar

The Calendar page follows the SAC Calendar. Code: `zsac.lib/calendar` (CalendarEngine, CalendarView, TaskRunner) and the page in `sacfiori` (`Calendar.controller.js`, `model/EventPanel.js`, `model/EventWizard.js`).

## Workspaces
* **List**: a tree of events and processes (expand and collapse) with status, progress, start and end date, and a timeline beside it with the bars, the finished part of each bar, hatching for events on hold, a dashed line for today and Day, Week, Month and Year zoom. A process shows the range of its children, their average progress and a status worked out from theirs.
* **Calendar**: month, week and day grids; a day with more than three events has a "more" link.
* Search, a status filter, **Mine** (events you own, are assigned to or may view), earlier, later, Today.

## Events
Types: General Task, Review Task, Composite Task, Process, **Data Locking Task**, **Data Action Task** and **Multi Action Task**; *Process from Template* (Budget cycle, Month-end close, Forecast cycle: a process with its tasks, each after the one before) and *Generate Events with Wizard* (the same event every day, week, month, quarter or year, up to 60).

Statuses: Open, In progress, In review, On hold, Completed, Cancelled, and the flags Overdue (the end has passed and it is not finished) and Delayed (it should have started and has not). Buttons for what the status allows: Start, Submit (needs a reviewer), Approve, Reject, Hold, Resume, Complete, Cancel, Reopen. An event can start after other events; a warning says when it starts before one of them ends.

## Dependencies
An event can start after other events (*Starts after*). The timeline draws a line from the end of the earlier bar into the start of the later one; the line is red when the later event starts before the earlier one ends, and the panel warns about it. When an event is **completed**, the events that waited for it and are still open start by themselves (they become *In progress* and the history says why), as soon as everything they wait for is done or cancelled.

## Approval
A review task is submitted by whoever may edit it and approved or rejected by its **reviewer** (or by the owner of the event; an event without an owner is open to everyone). Approving or rejecting asks for a comment, and a rejection must say why. Every status change is written to the **Activity** list of the event (who, when, what, the comment); the last 50 entries are kept. A rejected task goes back to *In progress*. Chains of reviews are built by letting each review start after the one before it, as the templates do.

## Reminders
In the app only: the Calendar's bell button and the bell in the header count what needs the user's attention today and list it: reviews waiting for them, their overdue and delayed events, events that end within the number of days they chose (3 by default, per event under *Remind the people on it*, or never) and events that start today or tomorrow. A person is involved as reviewer, owner or assignee. Choosing an entry shows the event. There is no e-mail or push: reminders are worked out when a page is opened, because the app has no server job.

## Planning tasks
* A **data action task** and a **multi action task** run the action in its run dialog, with the parameters kept in the task (*Parameters*). The result is recorded in the task: completed at 100 percent, or in progress with the message when it failed.
* A **data locking task** locks (or unlocks) a version of a model.
* *Run now* is a button: **nothing runs by itself on the start date**. Running on a schedule needs a server job, which this app does not have.

## People and files
Owners, assignees, viewers (see [sharing-and-security.md](sharing-and-security.md)); work files are stories, datasets, actions of this system or web addresses (http and https only), opened from the panel.

## Data
One table, `ZSAC_CALTASK`, with the event fields (type, parent, dates, progress, people, files, configuration as JSON). The first calendar's fields (due date, assignee, notes) are kept in step so older code and data keep working: an old task shows as a General Task on its due date.

## Panels
Every side panel of the app can be resized by dragging its edge (double-click for the standard width, arrow keys when the edge has focus): the navigation, the story palette and builder, the analyser, the modeller's details, the action designer's flow, the calendar's details and the calendar's list. The widths are kept per panel in the browser.
