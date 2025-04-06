// --- Backend Initialization - Place at the top of script.js ---

// Backend configuration using details provided
const firebaseConfig = {
  apiKey: "AIzaSyC8g78WtZfxDQybNM-TJD6oiyV-EbjwbfM", // From your Firebase project settings
  authDomain: "drew-of-the-hill-game.firebaseapp.com", // From your Firebase project settings
  databaseURL: "https://drew-of-the-hill-game-default-rtdb.firebaseio.com", // From your Firebase project
  projectId: "drew-of-the-hill-game", // From your Firebase project settings
  storageBucket: "drew-of-the-hill-game.appspot.com", // From your Firebase project settings
  messagingSenderId: "1016535304806", // From your Firebase project settings
  appId: "1:1016535304806:web:de03d031c57402e76c3ba7", // From your Firebase project settings
  measurementId: "G-Z8NP77QXGT" // Optional: Only if you need Analytics
};

// Initialize Backend
let db; // Declare db globally
try {
    // Using global firebase object from script tags
    if (typeof firebase !== 'undefined' && typeof firebase.initializeApp === 'function') {
        // Check if databaseURL looks like a valid URL (basic check)
        if (!firebaseConfig.databaseURL || !firebaseConfig.databaseURL.startsWith("https")) {
             console.error("Database URL might be missing or incorrect in configuration.");
             alert("ERROR: Database URL is missing or invalid. Please check the script.js file.");
             // Optional: Prevent further execution if DB URL is missing
             // throw new Error("Database URL is required and should be valid.");
        } else {
            const app = firebase.initializeApp(firebaseConfig);
            db = firebase.database(); // Assign to global db variable
            console.log("Backend initialized successfully!");
        }
    } else {
        console.error("Backend SDK not loaded correctly. Check script tags in index.html.");
        alert("Error: Database SDK failed to load. Please check the console.");
    }
} catch (error) {
    console.error("Error initializing backend system:", error);
    alert("Failed to initialize backend. Check console for details and ensure your configuration is correct.");
}


// --- Global Variables ---
let yourDesignation = null;
let currentDrewOnHill = null;
let claimTimestampOnHill = null;
let reignTimerId = null; // To hold the interval timer
let lastActivityTimestamp = null;
const INACTIVITY_THRESHOLD_BASE = 12 * 60 * 60 * 1000; // 12 hours in milliseconds as a base
const BOT_NAMES = [
  "Drew C-137", "Andy B-612", "Andrew X-99", 
  "Drew Sanchez", "Andy Smith", "Andrew Quantum", 
  "Drew Morty", "Dimensional Drew", "Council Drew Prime",
  "Interdimensional Andy", "Drew the Wise", "Citadel Andrew",
  "A-23 Drew", "Andy the Infinite", "A. Rickdrewski", "Drew-209", 
  "Citadel Guardian Drew", "Portal Drew", "Drew of Dimension Q",
  "Variant Andrew", "Multiverse Andy", "Andy Timewalker"
];

// Track which bot names have been used recently to avoid repetition
const recentlyUsedBotNames = [];
const MAX_RECENT_BOTS = 8; // Don't reuse the same bot names until we've cycled through several

// --- DOM Element References ---
const designationInput = document.getElementById('player-designation');
const setDesignationButton = document.getElementById('set-designation');
const yourDesignationDisplay = document.getElementById('your-designation-display');
const hillButton = document.getElementById('the-hill');
const currentDrewDisplay = document.getElementById('current-drew');
const currentReignTimeDisplay = document.getElementById('current-reign-time');
const yourTotalTimeDisplay = document.getElementById('your-total-time');
const yourLongestReignDisplay = document.getElementById('your-longest-reign');
const cumulativeList = document.getElementById('cumulative-list');
const reignList = document.getElementById('reign-list');


// --- Utility Functions ---
function formatTime(milliseconds) {
    if (milliseconds === null || milliseconds < 0 || isNaN(milliseconds)) return "0s";

    let totalSeconds = Math.floor(milliseconds / 1000);
    // Removed the "< 1s" check to show 0s correctly if duration is very short but non-zero ms
    if (totalSeconds < 0) return "Error"; // Should not happen

    const days = Math.floor(totalSeconds / (3600 * 24));
    totalSeconds %= (3600 * 24);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    let timeString = "";
    if (days > 0) timeString += `${days}d `;
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0) timeString += `${minutes}m `;
    // Include seconds if other units exist OR if it's the only unit (even if 0)
    if (timeString !== "" || seconds >= 0) {
         timeString += `${seconds}s`;
    }
    // If everything resulted in zero, return "0s"
    if (timeString.trim() === "0s" && milliseconds < 1000 && milliseconds >= 0) return "0s";
    if (timeString.trim() === "") return "0s"; // Fallback

    return timeString.trim();
}

function isValidDesignation(name) {
    // Allow almost any character, but trim and check length. Avoid reserved characters.
    const trimmedName = name ? name.trim() : '';
    if (trimmedName.length === 0 || trimmedName.length > 50) return false;
    // Basic check for reserved characters - crucial for using as database keys
    if (/[.$#\[\]/]/.test(trimmedName)) {
        console.warn("Designation contains reserved characters (., $, #, [, ], /). Please choose a different name.");
        alert("Designation cannot contain ., $, #, [, ], or / characters. Please choose a different name.");
        return false; // Disallow these characters
    }
    return true;
}

// --- Core Functions ---

function setupFirebaseListeners() {
    if (!db) {
        console.error("Database reference (db) is not initialized. Cannot setup listeners.");
        return;
    }
    // Clear old listeners before attaching new ones (important if designation changes)
    // Only detach specific listeners if possible, or detach all for simplicity if careful about re-attaching
    try {
        db.ref('/drewOfTheHill/gameState').off();
        db.ref('/drewOfTheHill/players').off(); // Detach general listener for leaderboards
        if(yourDesignation) {
             db.ref('/drewOfTheHill/players').child(yourDesignation).off(); // Detach specific player listener
        }
    } catch(e) { console.warn("Error detaching old listeners (might be first run):", e); }


    const gameStateRef = db.ref('/drewOfTheHill/gameState');
    const playersRef = db.ref('/drewOfTheHill/players');

    // 1. Game State Listener
    gameStateRef.on('value', (snapshot) => {
        const state = snapshot.val();
        if (state) {
            currentDrewOnHill = state.currentDrew;
            claimTimestampOnHill = state.claimTimestamp;

            currentDrewDisplay.textContent = currentDrewOnHill || '---';

            // Update reign timer
            clearInterval(reignTimerId); // Clear previous timer
            if (claimTimestampOnHill && typeof claimTimestampOnHill === 'number') {
                const updateReignTime = () => {
                    const reignDuration = Date.now() - claimTimestampOnHill;
                    // Display 0s immediately if timestamp is in the future (server time sync issue)
                    currentReignTimeDisplay.textContent = formatTime(Math.max(0, reignDuration));
                };
                updateReignTime(); // Update immediately
                reignTimerId = setInterval(updateReignTime, 1000); // Update every second
            } else {
                currentReignTimeDisplay.textContent = '0s';
            }

            // Update hill button appearance and disabled state
            if (currentDrewOnHill === yourDesignation && yourDesignation !== null) { // Check designation isn't null
                hillButton.classList.add('is-me');
                hillButton.disabled = true; // Disable claiming if you are the Drew
            } else {
                hillButton.classList.remove('is-me');
                hillButton.disabled = !yourDesignation; // Enable ONLY if designation is set AND you're not the current Drew
            }
        } else {
            // Initial state or could not read state
            console.log("Game state is null or unreadable, attempting to initialize.");
            currentDrewOnHill = null;
            claimTimestampOnHill = null;
            currentDrewDisplay.textContent = '---';
            currentReignTimeDisplay.textContent = '0s';
            clearInterval(reignTimerId);
            hillButton.classList.remove('is-me');
            hillButton.disabled = !yourDesignation; // Disable if no designation
             // Set an initial state if it doesn't exist (be careful with rules)
            gameStateRef.set({ currentDrew: null, claimTimestamp: null }).catch(err => console.error("Error setting initial game state:", err));
        }
    }, (error) => {
        console.error("Error reading game state:", error);
        // Provide user feedback (e.g., display error message on page)
        currentDrewDisplay.textContent = 'Error';
        currentReignTimeDisplay.textContent = 'Error';
        clearInterval(reignTimerId);
        hillButton.disabled = true; // Disable interaction on error
        alert("Error connecting to game state. Please check your connection or database setup.");
    });

    // 2. Your Player Stats Listener
    if (yourDesignation) {
        console.log(`Setting up stats listener for: ${yourDesignation}`);
        const yourPlayerRef = playersRef.child(yourDesignation);

        // First, make sure we have a clean listener setup
        yourPlayerRef.off('value');

        // Then set up the new listener
        yourPlayerRef.on('value', (snapshot) => {
            console.log(`Received stats data for ${yourDesignation}:`, snapshot.val());
            const stats = snapshot.val();
            if (stats) {
                // Make sure we have valid numbers
                const totalTime = typeof stats.totalTime === 'number' ? stats.totalTime : 0;
                const longestReign = typeof stats.longestReign === 'number' ? stats.longestReign : 0;

                yourTotalTimeDisplay.textContent = formatTime(totalTime);
                yourLongestReignDisplay.textContent = formatTime(longestReign);

                // Update the player stats section to show it's active
                document.getElementById('player-stats').classList.add('has-stats');
            } else {
                // Player node doesn't exist yet, initialize it
                console.log(`No stats found for ${yourDesignation}, initializing...`);
                yourTotalTimeDisplay.textContent = '0s';
                yourLongestReignDisplay.textContent = '0s';

                // Initialize with zeros - this creates the player node in Firebase
                yourPlayerRef.set({
                    totalTime: 0,
                    longestReign: 0,
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP
                }).then(() => {
                    console.log(`Successfully initialized stats for ${yourDesignation}`);
                    document.getElementById('player-stats').classList.add('has-stats');
                }).catch(err => {
                    console.error(`Error setting initial player stats for ${yourDesignation}:`, err);
                    alert(`Could not initialize your stats. Please check your connection and try again.`);
                });
            }
        }, (error) => {
            console.error(`Error reading player stats for ${yourDesignation}:`, error);
            yourTotalTimeDisplay.textContent = 'Error';
            yourLongestReignDisplay.textContent = 'Error';
            document.getElementById('player-stats').classList.add('stats-error');
            // Optionally show an error message in the stats section
            if (!document.getElementById('stats-error-message')) {
                const errorMsg = document.createElement('p');
                errorMsg.id = 'stats-error-message';
                errorMsg.className = 'error-message';
                errorMsg.textContent = 'Error loading your stats. Please check your connection.';
                document.getElementById('player-stats').appendChild(errorMsg);
            }
        });
    } else {
        // Clear stats if no designation
        yourTotalTimeDisplay.textContent = '0s';
        yourLongestReignDisplay.textContent = '0s';
        document.getElementById('player-stats').classList.remove('has-stats', 'stats-error');
        // Remove any error messages
        const errorMsg = document.getElementById('stats-error-message');
        if (errorMsg) errorMsg.remove();
    }

    // 3. Cumulative Leaderboard Listener
    playersRef.orderByChild('totalTime').limitToLast(10).on('value', (snapshot) => {
        cumulativeList.innerHTML = ''; // Clear existing list
        const players = [];
        snapshot.forEach((childSnapshot) => {
            // Basic check if data seems valid
            if(childSnapshot.key && childSnapshot.val() && typeof childSnapshot.val().totalTime === 'number') {
                 players.push({ designation: childSnapshot.key, ...childSnapshot.val() });
            }
        });
        // Reverse to show highest first
        players.reverse().forEach(player => {
            const li = document.createElement('li');
            // Sanitize designation display slightly
            const designationText = (player.designation || "Error").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            li.textContent = `${designationText} - ${formatTime(player.totalTime || 0)}`;
            cumulativeList.appendChild(li);
        });
    }, (error) => {
        console.error("Error reading cumulative leaderboard:", error);
        cumulativeList.innerHTML = '<li>Error loading leaderboard</li>';
    });

    // 4. Longest Reign Leaderboard Listener
    playersRef.orderByChild('longestReign').limitToLast(10).on('value', (snapshot) => {
        reignList.innerHTML = ''; // Clear existing list
        const players = [];
        snapshot.forEach((childSnapshot) => {
             // Only add if longestReign is actually set, valid, and > 0
             if (childSnapshot.key && childSnapshot.val() && typeof childSnapshot.val().longestReign === 'number' && childSnapshot.val().longestReign > 0) {
                players.push({ designation: childSnapshot.key, ...childSnapshot.val() });
             }
        });
        // Reverse to show highest first
        players.reverse().forEach(player => {
            const li = document.createElement('li');
             const designationText = (player.designation || "Error").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            li.textContent = `${designationText} - ${formatTime(player.longestReign || 0)}`;
            reignList.appendChild(li);
        });
     }, (error) => {
        console.error("Error reading longest reign leaderboard:", error);
        reignList.innerHTML = '<li>Error loading leaderboard</li>';
    });
}


function handleSetDesignation() {
    const newDesignationRaw = designationInput.value;
    const newDesignation = newDesignationRaw ? newDesignationRaw.trim() : ''; // Trim whitespace

    if (!isValidDesignation(newDesignation)) {
        // isValidDesignation function now shows an alert for invalid chars
        if(newDesignation.length === 0 || newDesignation.length > 50) {
             alert("Please enter a valid designation (1-50 characters).");
        }
        return;
    }

    // Detach old player listener if designation changes and db exists
    if (yourDesignation && db && yourDesignation !== newDesignation) {
        console.log(`Detaching listener for old designation: ${yourDesignation}`);
        db.ref('/drewOfTheHill/players').child(yourDesignation).off(); // Stop listening to old data
    }

    yourDesignation = newDesignation;
    localStorage.setItem('playerDesignation', yourDesignation); // Save locally
    yourDesignationDisplay.textContent = yourDesignation;
    // Keep input field value so user can easily change it again if needed
    // designationInput.value = yourDesignation;

    console.log(`Designation set to: ${yourDesignation}`);
    // alert(`Designation set to: ${yourDesignation}`); // Alert might be annoying, console log is enough

    // Update the player stats section to show loading state
    document.getElementById('player-stats').classList.remove('has-stats', 'stats-error');
    // Remove any existing error messages
    const errorMsg = document.getElementById('stats-error-message');
    if (errorMsg) errorMsg.remove();

    // Re-enable hill button if needed and set up new/correct listeners
    // Button disabled state will be correctly handled by the gameState listener now
    if(db) {
        setupFirebaseListeners(); // Re-run to attach listener for the new designation's stats & ensure others are active
    } else {
        console.error("Cannot setup listeners, db not initialized.");
        document.getElementById('player-stats').classList.add('stats-error');
    }
}


function handleHillClick() {
    if (!db) {
        console.error("Database reference (db) is not initialized. Cannot claim hill.");
        alert("Error: Cannot connect to database. Please refresh.");
        return;
    }
    if (!yourDesignation) {
        alert("Please set your designation before claiming the hill!");
        designationInput.focus(); // Focus input to prompt user
        return;
    }
    // Use the locally tracked currentDrewOnHill from the listener to avoid race conditions
    if (yourDesignation === currentDrewOnHill) {
        console.log("You are already the Drew!");
        return; // Already the king/drew
    }

    // Optimistically disable button immediately to prevent double-clicks
    hillButton.disabled = true;

    // Use the state captured when the listener last updated
    const prevDrew = currentDrewOnHill;
    const prevClaimTimestamp = claimTimestampOnHill;

    // Claim the Hill immediately using server time
    const gameStateRef = db.ref('/drewOfTheHill/gameState');
    gameStateRef.set({
        currentDrew: yourDesignation,
        claimTimestamp: firebase.database.ServerValue.TIMESTAMP // Use server time for accuracy
    }).then(() => {
         console.log(`${yourDesignation} claimed the hill!`);
         // Now, after successfully claiming, update the previous Drew's score
         // Check if there *was* a previous Drew and a valid timestamp
         if (prevDrew && typeof prevClaimTimestamp === 'number' && prevClaimTimestamp > 0) {
            // Use client time for duration calculation as server timestamp isn't known client-side accurately
            const clientNow = Date.now();
            const reignDuration = clientNow - prevClaimTimestamp;

            // Add a small threshold (e.g., 500ms) to avoid tiny updates from rapid clicks or sync issues
            if (reignDuration > 500) {
                 console.log(`Calculating reign duration for ${prevDrew}: ${reignDuration}ms`);
                 const prevPlayerRef = db.ref('/drewOfTheHill/players').child(prevDrew);

                 // Using a Transaction to safely update the score and longest reign
                 prevPlayerRef.transaction((currentData) => {
                    // If currentData is null, player node might not exist yet - initialize
                    if (currentData === null) {
                        // Return the initial stats including this first reign
                        return { totalTime: reignDuration, longestReign: reignDuration };
                    } else {
                        // Ensure properties exist before incrementing/comparing
                        currentData.totalTime = (currentData.totalTime || 0) + reignDuration;
                        currentData.longestReign = Math.max(currentData.longestReign || 0, reignDuration);
                        return currentData; // Return the modified data
                    }
                 }, (error, committed, snapshot) => {
                     // Optional: Callback function after transaction attempt
                     if (error) {
                         console.error(`Transaction failed for ${prevDrew}:`, error);
                     } else if (!committed) {
                         console.warn(`Transaction not committed for ${prevDrew} (data may have changed concurrently).`);
                         // Might need to inform the user or retry logic depending on importance
                     } else {
                         console.log(`Stats transaction successful for ${prevDrew}.`);
                     }
                 }); // End of transaction callback handling
            } else {
                 console.log(`Reign duration for ${prevDrew} (${reignDuration}ms) was too short, not updating stats.`);
                 // No need to re-enable button here, the listener will handle it based on state
            }
         } else {
             // No previous valid Drew or timestamp, no stats to update
             console.log("No previous Drew/timestamp to update stats for.");
         }
    }).catch((error) => {
         console.error("Failed to claim the hill:", error);
         alert("Error claiming the hill. Please check connection or try again.");
         // Re-enable button on failure ONLY IF the current drew isn't you (state listener handles the 'is-me' case)
         if(currentDrewOnHill !== yourDesignation){ hillButton.disabled = false; }
    });
}


// --- Initialization ---
function initApp() {
    // Initialize AOS (Animate on Scroll) library
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: 'ease-in-out',
            once: false,
            mirror: false
        });
    } else {
        console.warn('AOS library not loaded. Some animations may not work.');
    }
    
    // Initialize UI components for the new layout
    setupManifestoModal();
    setupLeaderboardTabs();
    
    // Load designation from local storage
    const savedDesignation = localStorage.getItem('playerDesignation');
    if (savedDesignation && isValidDesignation(savedDesignation)) { // Check validity on load
        yourDesignation = savedDesignation;
        designationInput.value = yourDesignation; // Pre-fill input
        yourDesignationDisplay.textContent = yourDesignation;
        console.log(`Loaded designation: ${yourDesignation}`);
    } else {
        if(savedDesignation) { // If it existed but was invalid
             localStorage.removeItem('playerDesignation'); // Clear invalid stored name
             console.warn("Removed invalid designation from localStorage.");
        }
        yourDesignationDisplay.textContent = 'Not Set';
        console.log("No valid designation found in localStorage.");
    }

    // Add event listeners
    setDesignationButton.addEventListener('click', handleSetDesignation);
    hillButton.addEventListener('click', handleHillClick);

    // Disable hill initially - enabled/disabled by game state listener based on designation
    hillButton.disabled = true; // Start disabled, listener will enable if appropriate

    // Setup Firebase listeners (if db initialized correctly)
    if (db) {
        setupFirebaseListeners();
        
        // Check for inactivity and potentially enhance engagement
        setTimeout(() => {
            checkEngagementAndAddActivity();
        }, 5000); // Wait 5 seconds after page load before checking activity
    } else {
        // Handle case where backend didn't initialize - error shown earlier.
        console.error("Database reference not available on initApp. Listeners not set.");
        // Display a persistent error message on the page
        try { // Use try-catch in case document isn't fully ready? Unlikely here.
             if(!document.getElementById('database-error-message')) { // Prevent adding multiple error messages
                 const errorDiv = document.createElement('div');
                 errorDiv.id = 'database-error-message';
                 errorDiv.style.color = 'red';
                 errorDiv.style.fontWeight = 'bold';
                 errorDiv.style.padding = '10px';
                 errorDiv.style.border = '1px solid red';
                 errorDiv.style.marginTop = '10px';
                 errorDiv.textContent = 'FATAL ERROR: Could not connect to Database. Please check configuration in script.js and refresh.';
                 document.body.insertBefore(errorDiv, document.body.firstChild); // Add error message at the top
             }
         } catch (e) { console.error("Could not display database error on page", e); }
    }
}

// --- UI Component Functions ---

// Setup the manifesto modal functionality
function setupManifestoModal() {
    const modal = document.getElementById('manifesto-modal');
    const btn = document.getElementById('manifesto-toggle');
    const closeBtn = document.querySelector('.close-modal');
    
    if (btn && modal && closeBtn) {
        btn.addEventListener('click', function() {
            modal.style.display = "block";
            document.body.style.overflow = "hidden"; // Prevent scrolling behind modal
        });
        
        closeBtn.addEventListener('click', function() {
            modal.style.display = "none";
            document.body.style.overflow = "auto"; // Re-enable scrolling
        });
        
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.style.display = "none";
                document.body.style.overflow = "auto";
            }
        });
    }
}

// Setup the leaderboard tabs
function setupLeaderboardTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                // Remove active class from all buttons and tab contents
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked button
                this.classList.add('active');
                
                // Show the corresponding tab content
                const targetId = this.getAttribute('data-target');
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }
}

// Update current year in footer
document.addEventListener('DOMContentLoaded', function() {
    const currentYearElement = document.getElementById('current-year');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }
});

// Run the app initialization once the DOM is ready (or immediately)
if (document.readyState === 'loading') { // Loading hasn't finished yet
  document.addEventListener('DOMContentLoaded', initApp);
} else { // `DOMContentLoaded` has already fired
  initApp();
}

// --- Activity Tracking and Engagement Functions ---
function checkEngagementAndAddActivity() {
    // Only proceed if Firebase is initialized
    if (!db) return;
    
    // First, check the last claim timestamp to determine activity
    const gameStateRef = db.ref('/drewOfTheHill/gameState');
    const playersRef = db.ref('/drewOfTheHill/players');
    
    gameStateRef.once('value')
    .then((snapshot) => {
        const gameState = snapshot.val();
        const now = Date.now();
        let lastActivity = null;
        
        // Check if we have a current claim and its timestamp
        if (gameState && gameState.claimTimestamp) {
            lastActivity = gameState.claimTimestamp;
        }
        
        // Apply randomness to the inactivity threshold (10-14 hours)
        const randomFactor = 0.8 + (Math.random() * 0.4); // Random factor between 0.8 and 1.2
        const INACTIVITY_THRESHOLD = INACTIVITY_THRESHOLD_BASE * randomFactor;
        
        // Random chance to skip checking even if criteria met (10% chance)
        if (Math.random() < 0.1) {
            console.log("Random check skipped for system variety");
            return;
        }
        
        // Check last activity timestamp to avoid adding activity too frequently
        if (lastActivityTimestamp) {
            // Variable cooldown period with randomness (3-6 hours)
            const hourVariance = 3 + (Math.random() * 3);
            const cooldownPeriod = hourVariance * 60 * 60 * 1000;
            
            if (now - lastActivityTimestamp < cooldownPeriod) {
                console.log(`Recent activity detected (${formatTime(now - lastActivityTimestamp)} ago), normal operation`);
                return;
            }
        }
        
        // If no claim or claim is older than threshold, consider creating engagement
        if (!lastActivity || (now - lastActivity > INACTIVITY_THRESHOLD)) {
            // Even when eligible, only add activity 85% of the time to create unpredictability
            if (Math.random() < 0.85) {
                console.log(`Low activity period detected for ${formatTime(now - (lastActivity || 0))}, adding engagement`);
                generateActivityParticipant();
            } else {
                console.log("Maintaining current activity levels (varied timing)");
            }
        } else {
            console.log(`Good activity levels detected ${formatTime(now - lastActivity)} ago, normal operation`);
        }
    })
    .catch(error => {
        console.error("Error checking activity status:", error);
    });
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateActivityParticipant() {
    if (!db) return;
    
    // Get available participant names that haven't been used recently
    let availableNames = BOT_NAMES.filter(name => !recentlyUsedBotNames.includes(name));
    // If we've used all names, reset and use any name
    if (availableNames.length === 0) {
        availableNames = BOT_NAMES;
        // Clear recently used list when we've cycled through many names
        if (recentlyUsedBotNames.length > BOT_NAMES.length * 0.7) {
            recentlyUsedBotNames.length = 0;
        }
    }
    
    // Pick a random name from available ones
    const participantName = availableNames[Math.floor(Math.random() * availableNames.length)];
    
    // Add to recently used list
    recentlyUsedBotNames.push(participantName);
    // Keep list at maximum size
    if (recentlyUsedBotNames.length > MAX_RECENT_BOTS) {
        recentlyUsedBotNames.shift(); // Remove oldest name
    }
    
    console.log(`New participant joining: ${participantName}`);
    
    // Generate realistic stats with additional randomness
    const timeOfDay = new Date().getHours();
    let baseReign;
    
    // Vary reign times based on time of day - simulating realistic behavior patterns
    if (timeOfDay >= 1 && timeOfDay <= 5) {
        // Late night/early morning - longer reigns (less competition)
        baseReign = getRandomInt(2 * 60 * 1000, 25 * 60 * 1000);
    } else if (timeOfDay >= 9 && timeOfDay <= 17) {
        // Business hours - shorter reigns (more competition)
        baseReign = getRandomInt(20 * 1000, 8 * 60 * 1000); 
    } else {
        // Evening/other times - medium reigns
        baseReign = getRandomInt(45 * 1000, 15 * 60 * 1000);
    }
    
    // Add some randomness to prevent patterns
    const randomMultiplier = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3
    const reignDuration = Math.floor(baseReign * randomMultiplier);
    
    // Total time should be more than longest reign for realism
    // Create a realistic ratio based on how many claims they might have had
    const claimCount = getRandomInt(2, 8);
    const reignEfficiency = 0.5 + (Math.random() * 0.5); // 50-100% efficiency factor
    const totalTime = Math.floor(reignDuration * claimCount * reignEfficiency);
    
    // Get the current high scores to ensure our participant isn't too dominant
    const playersRef = db.ref('/drewOfTheHill/players');
    const gameStateRef = db.ref('/drewOfTheHill/gameState');
    
    // First check if this name already exists to avoid duplication
    playersRef.child(participantName).once('value')
    .then((snapshot) => {
        if (snapshot.exists()) {
            console.log(`Participant ${participantName} already exists, skipping`);
            lastActivityTimestamp = Date.now();
            return;
        }
        
        // Then get high scores to make sure the score is realistic
        return playersRef.orderByChild('totalTime').limitToLast(5).once('value')
        .then((snapshot) => {
            let highestTime = 0;
            let lowestTopTime = 0;
            let playerCount = 0;
            let scoreArray = [];
            
            snapshot.forEach(childSnapshot => {
                playerCount++;
                const playerData = childSnapshot.val();
                if (playerData && typeof playerData.totalTime === 'number') {
                    scoreArray.push(playerData.totalTime);
                    highestTime = Math.max(highestTime, playerData.totalTime);
                    if (lowestTopTime === 0 || playerData.totalTime < lowestTopTime) {
                        lowestTopTime = playerData.totalTime;
                    }
                }
            });
            
            // Calculate a realistic score that fits the current leaderboard
            let adjustedTotalTime;
            
            if (playerCount >= 5) {
                // With enough players, position somewhere in the middle of the leaderboard
                // Sort scores from low to high
                scoreArray.sort((a, b) => a - b);
                
                // Target a position in the leaderboard - more random
                const targetIndex = Math.floor(Math.random() * scoreArray.length);
                const targetScore = scoreArray[targetIndex];
                
                // Calculate a score near the target position
                const variance = 0.8 + (Math.random() * 0.4); // 80-120% of target score
                adjustedTotalTime = Math.floor(targetScore * variance);
            } else if (highestTime > 0) {
                // Only a few scores exist, make score competitive but not dominant
                // Random position relative to highest: 60-95% of highest score
                const percentOfHighest = 0.6 + (Math.random() * 0.35);
                adjustedTotalTime = Math.floor(highestTime * percentOfHighest);
            } else {
                // No players yet, use the originally calculated time
                adjustedTotalTime = totalTime;
            }
            
            // Adjust longest reign based on total time
            const adjustedReign = Math.min(reignDuration, Math.floor(adjustedTotalTime * 0.6));
            
            // Add some natural variation to the timestamp
            const timestampVariance = Math.floor(Math.random() * 1000 * 60 * 10); // Up to 10 minutes
            const adjustedTimestamp = Date.now() - timestampVariance;
            
            // Add the participant to players database
            const participantRef = playersRef.child(participantName);
            return participantRef.set({
                totalTime: adjustedTotalTime,
                longestReign: adjustedReign,
                lastUpdated: adjustedTimestamp
            }).then(() => {
                console.log(`Participant ${participantName} joined with ${formatTime(adjustedTotalTime)} total time and ${formatTime(adjustedReign)} longest reign`);
                
                // Decide whether to make the participant claim the hill
                // Vary probability based on current hill state
                let claimProbability = 0.33; // Base 1/3 chance
                
                // If hill is empty, more likely to claim
                if (!currentDrewOnHill) {
                    claimProbability = 0.8;
                }
                
                if (Math.random() < claimProbability) {
                    gameStateRef.set({
                        currentDrew: participantName,
                        claimTimestamp: firebase.database.ServerValue.TIMESTAMP
                    }).then(() => {
                        console.log(`${participantName} claimed the hill!`);
                    }).catch(error => {
                        console.error("Error with hill claim:", error);
                    });
                }
                
                // Remember when we last added a participant
                lastActivityTimestamp = Date.now();
            }).catch(error => {
                console.error("Error adding participant:", error);
            });
        });
    }).catch(error => {
        console.error("Error checking for existing participant or high scores:", error);
    });
}

// --- Buy Me a Coffee Strategic Marketing Functions ---

// Track user interactions for optimal Buy Me a Coffee timing
let interactionCount = 0;
let lastAchievementShown = 0;
let bmcElementsInitialized = false;

function initBuyMeCoffeeElements() {
    if (bmcElementsInitialized) return;
    
    // Set up floating button behavior
    const floatButton = document.querySelector('.bmc-float-button');
    if (floatButton) {
        // Initially hidden
        setTimeout(() => {
            floatButton.classList.add('visible');
        }, 40000); // Show after 40 seconds of engagement
    }
    
    // Set up achievement banner behavior
    const achievementBanner = document.getElementById('achievement-banner');
    if (achievementBanner) {
        // Initially hidden - will be shown on significant events
    }
    
    // Add interaction counting for psychological timing
    document.addEventListener('click', incrementInteractionCount);
    
    // Set initial state
    bmcElementsInitialized = true;
    console.log("Buy Me a Coffee elements initialized");
}

function incrementInteractionCount(e) {
    // Only count meaningful interactions
    const clickedElement = e.target;
    const isButton = clickedElement.tagName === 'BUTTON' || 
                     clickedElement.closest('button') || 
                     clickedElement.tagName === 'A' ||
                     clickedElement.closest('a');
    
    if (isButton) {
        interactionCount++;
        
        // After sufficient interactions, show achievement with BMC
        if (interactionCount >= 3 && interactionCount % 3 === 0) {
            const now = Date.now();
            // Don't show achievements too frequently
            if (now - lastAchievementShown > 60000) { // At least 1 minute between achievements
                showAchievementBanner();
                lastAchievementShown = now;
            }
        }
    }
}

function showAchievementBanner() {
    const banner = document.getElementById('achievement-banner');
    if (!banner) return;
    
    // Add some variety to achievement messages
    const achievements = [
        {
            title: "Interdimensional Explorer!",
            message: "Your journey through the multiverse continues!"
        },
        {
            title: "Council Recognition!",
            message: "The Council of Andrew acknowledges your dedication."
        },
        {
            title: "Multiversal Progress!",
            message: "You're making waves across dimensions."
        }
    ];
    
    // Select a random achievement
    const achievement = achievements[Math.floor(Math.random() * achievements.length)];
    
    // Update achievement text
    const titleElement = banner.querySelector('h4');
    const messageElement = banner.querySelector('p');
    
    if (titleElement) titleElement.textContent = achievement.title;
    if (messageElement) messageElement.textContent = achievement.message;
    
    // Show the banner
    banner.classList.add('show');
    
    // Hide after 12 seconds
    setTimeout(() => {
        banner.classList.remove('show');
    }, 12000);
}

// Add this function to the hill button click for psychological timing
function handleSuccessfulHillClaim() {
    // Show achievement with BMC prompt when a user successfully claims the hill
    if (yourDesignation === currentDrewOnHill) {
        // Small delay for better psychological impact - after success recognition
        setTimeout(() => {
            showAchievementBanner();
            lastAchievementShown = Date.now();
        }, 2000);
    }
}

// Modify the existing handleHillClick function to call our new function
const originalHandleHillClick = handleHillClick;
handleHillClick = function() {
    // Call original function
    originalHandleHillClick.apply(this, arguments);
    
    // Add our enhancement (will only trigger if claim was successful)
    setTimeout(() => {
        if (yourDesignation === currentDrewOnHill) {
            handleSuccessfulHillClaim();
        }
    }, 1500); // Give time for Firebase to update
};

// Add to the initialization
const originalInitApp = initApp;
initApp = function() {
    // Call original function
    originalInitApp.apply(this, arguments);
    
    // Initialize our Buy Me a Coffee elements
    initBuyMeCoffeeElements();
};

// Add scroll depth tracking for floating button visibility
window.addEventListener('scroll', function() {
    // Get scroll position
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    const pageHeight = document.documentElement.scrollHeight;
    const windowHeight = window.innerHeight;
    const scrollPercentage = (scrollPosition / (pageHeight - windowHeight)) * 100;
    
    // Show floating button when user has scrolled down at least 25%
    const floatButton = document.querySelector('.bmc-float-button');
    if (floatButton && scrollPercentage > 25) {
        floatButton.classList.add('visible');
    }
});

// Add exit intent detection for a final prompt opportunity
document.addEventListener('mouseleave', function(e) {
    // Only trigger when mouse leaves the top of the page
    if (e.clientY < 5 && interactionCount > 2) {
        const now = Date.now();
        // Show only once every 5 minutes at most
        if (now - lastAchievementShown > 300000) {
            showAchievementBanner();
            lastAchievementShown = now;
        }
    }
});
