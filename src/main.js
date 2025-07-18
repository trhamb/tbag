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

// Track input for TTS
let lastInputValue = '';

// TTS Queue system
let ttsQueue = [];
let isSpeaking = false;
let currentSpeechId = null;
let queuePaused = false;

function speakQueued(text) {
    if (!window.responsiveVoice || typeof window.responsiveVoice.speak !== 'function') {
        return;
    }
    
    ttsQueue.push(text);
    
    if (!isSpeaking && !queuePaused) {
        speakNext();
    }
}

function speakNext() {
    if (ttsQueue.length === 0 || queuePaused) {
        isSpeaking = false;
        currentSpeechId = null;
        return;
    }
    
    isSpeaking = true;
    const text = ttsQueue.shift();
    
    console.log('Speaking queued text:', text);
    
    currentSpeechId = window.responsiveVoice.speak(text, "UK English Male", {
        rate: 0.9,
        pitch: 1.0,
        volume: 1.0,
        onend: () => {
            // Wait a bit before speaking the next item
            setTimeout(speakNext, 300);
        },
        onerror: () => {
            // If there's an error, continue with next item
            setTimeout(speakNext, 300);
        }
    });
}

// Function to handle interruption and clear queue
function handleInterruption() {
    console.log('handleInterruption called:', {
        isSpeaking,
        currentSpeechId,
        queueLength: ttsQueue.length
    });
    
    if (isSpeaking || ttsQueue.length > 0) {
        console.log('Speech interrupted, clearing queue...');
        // Stop current speech
        window.responsiveVoice.cancel();
        // Clear the entire queue
        ttsQueue = [];
        queuePaused = false;
        isSpeaking = false;
        currentSpeechId = null;
        console.log('Queue cleared, state reset');
    }
}

// Add input event listener for word reading on space
commandInput.addEventListener('input', (e) => {
    const currentText = e.target.value;
    
    console.log('Input event:', {
        currentText,
        lastInputValue,
        isSpeaking,
        queueLength: ttsQueue.length
    });
    
    // Check if a space was just added
    if (currentText.length > lastInputValue.length && currentText.endsWith(' ')) {
        // A space was just added, read the word that was completed
        const completedWord = lastInputValue.split(' ').pop();
        if (completedWord && window.responsiveVoice) {
            window.responsiveVoice.speak(completedWord, "UK English Male", {
                rate: 1.0,
                pitch: 1.0,
                volume: 0.8
            });
        }
    } else if (currentText.length > lastInputValue.length) {
        // User is typing new characters, interrupt narration if it's playing
        console.log('User typing, checking for interruption...');
        if (isSpeaking || ttsQueue.length > 0) {
            console.log('Interrupting narration...');
            handleInterruption();
        }
    }
    
    lastInputValue = currentText;
});



// Print text to Output Area
function print(text, className = "game-output") {
    const div = document.createElement('div');
    div.textContent = text;
    div.className = className;
    outputDiv.appendChild(div);
    outputDiv.scrollTop = outputDiv.scrollHeight;
    
    // TTS: Speak the text (skip player input and separator lines)
    if (className !== "player-input" && text.trim() !== "---" && text.trim() !== "") {
        speakQueued(text);
    }
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
        const furnitureNames = await getFurnitureNames(currentRoom.furniture);
        print('You see: ' + furnitureNames.join(', '));
    }

    // Show items on the floor
    const state = roomsState[currentRoomId];
    if (state.floorItems && state.floorItems.length > 0) {
        const itemNames = await getItemNames(state.floorItems);
        print('On the floor: ' + itemNames.join(', '));
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
        });
        commandInput.value = '';
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // Wait for ResponsiveVoice to be ready
    const checkResponsiveVoice = () => {
        console.log('Checking ResponsiveVoice:', window.responsiveVoice);
        if (window.responsiveVoice && typeof window.responsiveVoice.speak === 'function') {
            console.log('ResponsiveVoice is ready, loading room...');
            loadRoom(INITIAL_ROOM_PATH);
        } else {
            console.log('ResponsiveVoice not ready yet, retrying...');
            setTimeout(checkResponsiveVoice, 200);
        }
    };
    
    // Start checking after a short delay to ensure script is loaded
    setTimeout(checkResponsiveVoice, 500);
});