import { handleCommand } from './engine/parser.js'

// Initial Room Path
const INITIAL_ROOM_PATH = '../data/rooms/lobby/room.json';

// Globals
let inventory = [];
let roomsState = {};
let currentRoomId = null;

// Player's current room
let currentRoom = null;

// Get DOM Elements
const outputDiv = document.getElementById('output');
const inputForm = document.getElementById('input-form');
const commandInput = document.getElementById('command-input');

// Print text to Output Area
function print(text, className = "game-output") {
    const div = document.createElement('div');
    div.textContent = text;
    div.className = className;
    outputDiv.appendChild(div);
    outputDiv.scrollTop = outputDiv.scrollHeight;
}

// Load Room JSON and display info
async function loadRoom(roomPath) {
    const response = await fetch(roomPath);
    if (!response.ok) {
        print('Error loading room data.');
        return;
    }
    const roomData = await response.json();
    currentRoomId = roomData.id;
    currentRoom = roomData;

    // Debug: Check room data
    console.log('Loaded room:', roomData);

    if (!roomsState[currentRoomId]) {
        roomsState[currentRoomId] = {
            floorItems: roomData.floor?.items ? [...roomData.floor.items] : [],
            furniture: {}
        };

        if (roomData.furniture) {
            for (const furnId of roomData.furniture) {
                // Load the furniture JSON
                const furnResponse = await fetch(`../data/rooms/${currentRoomId}/furniture/${furnId}.json`);
                const furnData = await furnResponse.json();

                // Initialize furniture state
                let furnitureState = {
                    isOpen: furnData.isOpen || false,
                    items: furnData.items ? [...furnData.items] : []
                };

                // If the furniture has drawers, initialize their state
                if (furnData.storage) {
                    furnitureState.storage = {};
                    for (const storageObj of furnData.storage) {
                        furnitureState.storage[storageObj.id] = {
                            isOpen: storageObj.isOpen || false,
                            items: storageObj.items ? [...storageObj.items] : []
                        };
                    }
                }

                roomsState[currentRoomId].furniture[furnId] = furnitureState;
            }
        }
    }

    renderRoom();
}

// Get furniture names from JSON files
async function getFurnitureNames(furnitureIds) {
    const names = [];
    for (const furnId of furnitureIds) {
        const response = await fetch(`../data/rooms/${currentRoomId}/furniture/${furnId}.json`);
        if (response.ok) {
            const furnData = await response.json();
            names.push(furnData.name);
        } else {
            names.push(furnId);
        }
    }
    return names;
}

// Get item names from JSON files
async function getItemNames(itemIds) {
    const names = [];
    for (const itemId of itemIds) {
        const response = await fetch(`../data/rooms/${currentRoomId}/items/${itemId}.json`);
        if (response.ok) {
            const itemData = await response.json();
            names.push(itemData.name);
        } else {
            names.push(itemId);
        }
    }
    return names;
}

// Render the current room
async function renderRoom() {

    print('\n---\n');
    console.log('Rendering room:', currentRoom);
    print(currentRoom.name);
    print(currentRoom.description);

    // Show furniture
    if (currentRoom.furniture && currentRoom.furniture.length > 0) {
        print('You see: ' + currentRoom.furniture.join(', '));
    }

    // Show items on the floor (from state)
    const state = roomsState[currentRoomId];
    if (state.floorItems && state.floorItems.length > 0) {
        print('On the floor: ' + state.floorItems.join(', '));
    }

    // Show exits
    if (currentRoom.exits && currentRoom.exits.length > 0) {
        const exits = currentRoom.exits.map(e => e.direction).join(', ');
        print('Exits: ' + exits);
    }
}

// Player Command Handler
inputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const command = commandInput.value.trim().toLowerCase();
    if (command ) {
        print('> ' + command, 'player-input');
        handleCommand(command, {
            print,
            inventory,
            roomsState,
            currentRoomId,
            currentRoom,
            getFurnitureNames,
            getItemNames,
            loadRoom,
            renderRoom
        })
        commandInput.value = '';
    }
});

window.addEventListener('DOMContentLoaded', () => {
    loadRoom(INITIAL_ROOM_PATH);
});