# Mover — Project Overview

## What It Is

Mover is a free, open source 2D home layout planner that runs entirely in the browser. It lets you draw rooms, place furniture, and overlay scaled reference images — no account, no server, no cost.

## Problem

Existing tools (RoomSketcher, Planner 5D, Floorplanner) are either paywalled, cloud-locked, or require an account to save work. Free alternatives are outdated, hard to use, or lack key features like reference image scaling. There is no good open source option.

## Goals

- Draw 2D floor plans with walls and rooms
- Place and arrange furniture from a built-in catalog or custom definitions
- Import a reference image (photo of a floor plan, graph paper sketch) and calibrate it to real-world scale
- Work entirely offline — save/load as a local JSON file
- Export as PNG or SVG for sharing
- Simple enough for a non-technical homeowner to use in 30 minutes

## Non-Goals

- 3D view or rendering
- Cloud sync or multi-user collaboration
- Architectural/structural accuracy (this is for planning and visualization, not blueprints)
- Mobile-first UI (desktop browser is the target)
- Plugin marketplace or scripting

## Target Users

1. Homeowners planning a room rearrangement
2. Renters deciding if furniture fits before moving
3. Interior designers sketching quick concepts for clients
4. Anyone who would otherwise drag furniture around a graph paper grid

## Success Criteria

- A user with no prior training can place a room and three pieces of furniture in under 5 minutes
- Files are portable — a saved `.mover.json` file opens correctly on any machine
- The catalog covers the 20 most common household furniture pieces out of the box
- Reference images can be calibrated to within 1% of true scale
