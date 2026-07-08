# Changelog: Admin Guide and Credit Footer

## Overview
This update added two major pieces of polish to the system:
1. a dedicated Admin Guide experience for administrators, and
2. a credit footer / attribution layer that clearly identifies the project as being created by the STS Team for the STS Team.

## Admin Guide Added
- Created the new admin guide system in adminguide.js.
- Built a dedicated Admin Guide screen inside the application so admins can access help directly from the dashboard instead of relying on outside notes or memory.
- Added a structured guide layout with:
  - a table of contents for quick navigation
  - expandable/collapsible sections
  - a built-in search function to filter guide topics
  - anchor-style section jumps so admins can move quickly to specific topics
- Added detailed guide content covering the main operational areas of the admin dashboard, including:
  - overview of the admin system
  - admin status and availability
  - load history and load review
  - load status workflow
  - audit log review
  - permissions and access controls
  - creating and managing users
  - off days, weekly schedules, and request handling
  - shift assignment and existing user updates
  - action center responsibilities
  - announcements and dropdown usage
  - team monitoring and user insights
  - recommended daily routine
  - troubleshooting and best practices
  - how the various admin panel buttons function
- Expanded the guide with an Alerts Panel section that explains:
  - late clock-ins
  - extended breaks
  - extended away status
  - overtime requests
  - off-day change requests
- Each alert item in the guide now explains what the alert means, why it appears, and how an administrator should respond.

## Admin Guide Functionality Details
- The guide is implemented as a self-contained script that renders the content dynamically from structured data.
- It supports interaction through the page UI, including:
  - opening the guide from the admin area
  - closing the guide and returning to the main admin screen
  - navigating directly to specific sections
  - searching for relevant content instantly
  - expanding and collapsing sections to reduce visual clutter
- This makes the guide useful both for new admins learning the system and experienced admins who need a quick refresher during busy shifts.

## Credit Footer Added
- Added a visible credit footer line in the main interface stating:
  - "Created by the STS Team, for the STS Team."
- The footer was also included in the dashboard area and in the guide experience so the attribution remains visible in multiple contexts.
- A more detailed about-style modal was also added with a credit message that says:
  - "Made by B009 through countless sleepless nights, in collaboration with ChatGPT and Claude."
  - "Created to simplify daily operations, support dispatchers and Safety personnel, and continuously improve alongside the STS Team."
  - "Built for the team. Improved by the team."

## Credit Footer Purpose
- The credit footer serves as a visible acknowledgment of the people behind the system.
- It gives the project a clear identity as an internal, team-built tool rather than a generic external product.
- It highlights the effort, dedication, and collaboration that went into building and refining the platform.
- It also reinforces the idea that the system was designed specifically for the STS Team and their operational needs.

## Why These Changes Matter
- The Admin Guide makes the system easier to learn and easier to use under pressure.
- The footer adds personality, ownership, and recognition to the project.
- Together, these updates improve both usability and the sense of team ownership around the application.
