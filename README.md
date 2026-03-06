# Campaigns

**Campaigns** is a browser-based educational history game where players guide real-world expeditions, trails, and journeys through difficult choices, limited resources, and changing conditions.

Inspired by classics like **The Oregon Trail**, the goal of **Campaigns** is to make history more interactive, readable, and engaging for students and curious players.

## What It Is

In each campaign, players take charge of a historical journey and try to keep their group moving, healthy, and supplied. Along the way, they face problems based on real historical challenges such as:

- weather
- illness
- morale
- supply shortages
- dangerous terrain
- leadership decisions
- historically grounded events

The game is designed to help players learn through decision-making rather than memorization.

## Educational Focus

**Campaigns** is being built first and foremost as an educational tool.

The project aims to:

- make history more engaging for students
- encourage curiosity about real people, places, and events
- show how geography, leadership, scarcity, and risk shaped historical outcomes
- present history in a format that is easy to read and interact with
- support classroom-friendly use with accessible language and clear choices

Rather than treating history as a list of facts, **Campaigns** treats it as a series of human problems, tradeoffs, and consequences.

## Features

Planned and in-progress features include:

- multiple historical campaigns
- resource management
- crew health and morale systems
- event-based decision making
- student-friendly writing
- historically informed scenarios
- retro-inspired HUD portraits and browser-game presentation

## Example Campaigns

Possible campaigns include journeys such as:

- the Chisholm Trail
- Lewis and Clark
- Magellan's circumnavigation
- the Silk Road

Each campaign can introduce its own challenges, geography, and historical context.

## Why This Project Exists

A lot of educational tools are informative but not very engaging.  
A lot of games are engaging but not very educational.

**Campaigns** is an attempt to combine both.

The goal is to create something that can be useful in classrooms, interesting to students, and fun enough that players actually want to keep going. Which, in educational game design, is basically the final boss.

## Status

This project is currently in active development.

Systems, art, campaigns, and educational content are still evolving.

## Tech

This is a browser-based project built to stay lightweight, readable, and easy to expand.

## Author

Created by **Andrew Augustine**.
## Face Strip Slicing Utility

To split `*_states.png` face strips into individual status panels:

```bash
python scripts/slice_faces.py
```

Optional flags:

```bash
python scripts/slice_faces.py --in public/faces --out public/faces/sliced --divider 6
```

The script writes generated PNGs into `public/faces/sliced/` (these are build artifacts and are not committed).
