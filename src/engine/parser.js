// Input Parsing
export function handleCommand(command, gameContext) {
    const [verb, ...rest] = command.split(' ');
    const target = rest.join(' ').trim();

    console.log(verb, target);

    switch (verb) {
        case 'examine':
            examine(target, gameContext);
            break;
        case 'open':
            openStorage(target, gameContext);
            break;
        case 'take':
            takeItem(target, gameContext);
            break;
        case 'use':
            useItem(target, gameContext);
            break;
        default:
            gameContext.print("I didn't understand that command. For a list of commands, type 'commands'.")
    }
}

export async function findObjectsByName(name, gameContext) {
    name = name.trim().toLowerCase();
    let exactMatches = [];
    let partialMatches = [];

    // Helper to check and add matches
    function checkMatch(obj, id, type, parent) {
        const objName = obj.name.toLowerCase();
        if (objName === name) {
            exactMatches.push({ type, id, data: obj, parent });
        } else if (objName.includes(name)) {
            partialMatches.push({ type, id, data: obj, parent });
        } else {
            // NEW: Flexible word match
            const inputWords = name.split(' ').filter(Boolean);
            if (inputWords.every(word => objName.includes(word))) {
                partialMatches.push({ type, id, data: obj, parent });
            }
        }
    }

    // 1. Check floor items
    for (const itemId of gameContext.roomsState[gameContext.currentRoomId].floorItems) {
        const response = await fetch(`../data/rooms/${gameContext.currentRoomId}/items/${itemId}.json`);
        if (response.ok) {
            const itemData = await response.json();
            checkMatch(itemData, itemId, 'item');
        }
    }

    // 2. Check furniture and their storage
    for (const furnId of gameContext.currentRoom.furniture) {
        const response = await fetch(`../data/rooms/${gameContext.currentRoomId}/furniture/${furnId}.json`);
        if (response.ok) {
            const furnData = await response.json();
            checkMatch(furnData, furnId, 'furniture');
            if (furnData.storage) {
                for (const storageObj of furnData.storage) {
                    checkMatch(storageObj, storageObj.id, 'storage', furnData.name);
                }
            }
        }
    }

    // Check items inside open storage (drawers, cabinets, etc.)
    for (const furnId of gameContext.currentRoom.furniture) {
        const furnState = gameContext.roomsState[gameContext.currentRoomId].furniture[furnId];
        if (furnState && furnState.storage) {
            for (const storageId of Object.keys(furnState.storage)) {
                const storageState = furnState.storage[storageId];
                if (storageState.isOpen && storageState.items) {
                    for (const itemId of storageState.items) {
                        const response = await fetch(`../data/rooms/${gameContext.currentRoomId}/items/${itemId}.json`);
                        if (response.ok) {
                            const itemData = await response.json();
                            checkMatch(itemData, itemId, 'item', storageState.name || "storage");
                        }
                    }
                }
            }
        }
    }

    // 3. Check wall items
    for (const wall of gameContext.currentRoom.walls || []) {
        for (const itemId of wall.items || []) {
            const response = await fetch(`../data/rooms/${gameContext.currentRoomId}/items/${itemId}.json`);
            if (response.ok) {
                const itemData = await response.json();
                checkMatch(itemData, itemId, 'item', `on the ${wall.direction} wall`);
            }
        }
    }

    // 4. Check for floor
    if (["floor", "the floor"].includes(name)) {
        if (gameContext.currentRoom.floor) {
            checkMatch(
                { name: "Floor", description: gameContext.currentRoom.floor.description },
                "floor",
                "floor"
            );
        }
    }

    // 5. Check for walls (all or by direction)
    const wallKeywords = ["wall", "walls"];
    const wallDirections = ["north", "south", "east", "west"];

    if (wallKeywords.includes(name)) {
        for (const wall of gameContext.currentRoom.walls || []) {
            checkMatch(
                { name: `${wall.direction.charAt(0).toUpperCase() + wall.direction.slice(1)} Wall`, description: wall.description },
                wall.direction,
                "wall"
            );
        }
    } else if (wallDirections.includes(name)) {
        const wall = (gameContext.currentRoom.walls || []).find(w => w.direction === name);
        if (wall) {
            checkMatch(
                { name: `${wall.direction.charAt(0).toUpperCase() + wall.direction.slice(1)} Wall`, description: wall.description },
                wall.direction,
                "wall"
            );
        }
    } else {
        // NEW: Check for "[direction] wall"
        for (const dir of wallDirections) {
            if (name === `${dir} wall`) {
                const wall = (gameContext.currentRoom.walls || []).find(w => w.direction === dir);
                if (wall) {
                    checkMatch(
                        { name: `${wall.direction.charAt(0).toUpperCase() + wall.direction.slice(1)} Wall`, description: wall.description },
                        wall.direction,
                        "wall"
                    );
                }
            }
        }
    }

    // Prefer exact matches, but fall back to partial matches if no exact
    if (exactMatches.length > 0) return exactMatches;
    return partialMatches;
}

// Command Functions
async function examine(target, gameContext) {
    const matches = await findObjectsByName(target, gameContext);
    if (matches.length === 0) {
        gameContext.print("You don't see that here.");
    } else if (matches.length === 1) {
        gameContext.print(matches[0].data.description);
    } else {
        // Multiple matches: prompt for clarification
        const options = matches.map(m => m.parent ? `${m.parent} ${m.data.name}` : m.data.name);
        gameContext.print(`Which do you mean? ${options.join(' or ')}`);
    }
}

async function openStorage(target, context) {
    const matches = await findObjectsByName(target, context);

    if (matches.length === 0) {
        context.print("You don't see that here.");
    } else if (matches.length === 1) {
        const storage = matches[0];

        console.log('openStorage match:', storage);
        if (storage.type !== 'storage') {
            context.print("You can't open that.");
            return;
        }
        // Find the parent furniture's state in roomsState
        let parentFurnitureId = null;
        for (const fid of Object.keys(context.roomsState[context.currentRoomId].furniture)) {
            const furnState = context.roomsState[context.currentRoomId].furniture[fid];
            if (furnState.storage && furnState.storage[storage.id]) {
                parentFurnitureId = fid;
                break;
            }
            // If you use 'storage' instead of 'drawers' in state, adjust here
            if (furnState.storage && furnState.storage[storage.id]) {
                parentFurnitureId = fid;
                break;
            }
        }
        if (!parentFurnitureId) {
            context.print("You can't open that.");
            return;
        }
        // Use the correct property name for your state (drawers or storage)
        const parentState = context.roomsState[context.currentRoomId].furniture[parentFurnitureId];
        const storageState = parentState.storage
            ? parentState.storage[storage.id]
            : parentState.storage
                ? parentState.storage[storage.id]
                : null;
        console.log('parentFurnitureId:', parentFurnitureId);
        console.log('parentState:', parentState);
        console.log('drawerState:', storageState);
        if (!storage.data.canOpen) {
            context.print("You can't open that.");
        } else if (storageState.isOpen) {
            context.print("It's already open.");
        } else {
            storageState.isOpen = true;
            context.print(`You open the ${storage.data.name}.`);
            if (storageState.items && storageState.items.length > 0) {
                // Use getItemNames to get human-readable names
                context.getItemNames(storageState.items).then(itemNames => {
                    context.print(`Inside you see: ${itemNames.join(', ')}`);
                });
            } else {
                context.print("It's empty.");
            }
        }
    } else {
        const options = matches.map(m => m.parent ? `${m.parent} ${m.data.name}` : m.data.name);
        context.print(`Which do you mean? ${options.join(' or ')}`);
    }
}

async function takeItem(target, context) {
    const matches = await findObjectsByName(target, context);

    if (matches.length === 0) {
        context.print("You don't see that here.");
        return;
    } else if (matches.length > 1) {
        const options = matches.map(m => m.parent ? `${m.parent} ${m.data.name}` : m.data.name);
        context.print(`Which do you mean? ${options.join(' or ')}`);
        return;
    }

    const match = matches[0];

    // Only allow taking items
    if (match.type !== 'item') {
        context.print("You can't take that.");
        return;
    }

    // Load item JSON to check canTake
    const response = await fetch(`../data/rooms/${context.currentRoomId}/items/${match.id}.json`);
    if (!response.ok) {
        context.print("You can't take that.");
        return;
    }
    const itemData = await response.json();
    if (itemData.canTake === false) {
        context.print("You can't take that.");
        return;
    }

    // Remove from floor, wall, or storage
    let removed = false;
    // 1. Floor
    const floorItems = context.roomsState[context.currentRoomId].floorItems;
    const floorIdx = floorItems.indexOf(match.id);
    if (floorIdx !== -1) {
        floorItems.splice(floorIdx, 1);
        removed = true;
    }
    // 2. Wall items
    for (const wall of context.currentRoom.walls || []) {
        const wallItems = wall.items || [];
        const wallIdx = wallItems.indexOf(match.id);
        if (wallIdx !== -1) {
            wallItems.splice(wallIdx, 1);
            removed = true;
        }
    }
    // 3. Storage (drawers, cabinets)
    for (const furnId of Object.keys(context.roomsState[context.currentRoomId].furniture)) {
        const furnState = context.roomsState[context.currentRoomId].furniture[furnId];
        if (furnState.storage) {
            for (const storageId of Object.keys(furnState.storage)) {
                const storageItems = furnState.storage[storageId].items;
                const storageIdx = storageItems.indexOf(match.id);
                if (storageIdx !== -1 && furnState.storage[storageId].isOpen) {
                    storageItems.splice(storageIdx, 1);
                    removed = true;
                }
            }
        }
    }

    if (removed) {
        context.inventory.push(match.id);
        context.print(`You take the ${itemData.name}.`);
        context.renderRoom && context.renderRoom();
    } else {
        context.print("You can't take that right now.");
    }
}

function useItem(target, gameContext) {
    gameContext.print('Use Itemy Witemy');
}