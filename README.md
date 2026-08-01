# Sentinel

A web application that allows citizens to report local civic issues (such as potholes, broken streetlights, or public hazards) with photo uploads, location tagging, and real-time status tracking.

## Features
* **Report Issues:** Submit detailed reports with images, titles, and descriptions.
* **GPS & Map Integration:** Automatically capture device location or select coordinates manually on an interactive map.
* **Status Tracking:** Monitor report updates through status tags (*Pending*, *In Progress*, or *Resolved*).
* **Responsive Design:** Optimized layout for seamless navigation across mobile devices and desktops.

## Tech Stack
* **Frontend:** HTML, CSS, JavaScript, Leaflet.js
* **Backend:** Node.js, Express
* **Database:** MongoDB Atlas
* **Authentication:** JSON Web Tokens (JWT) & bcrypt

## Local Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone <https://github.com/chinexdoc-beep/sentinel.git>
   cd sentinel
   npm install