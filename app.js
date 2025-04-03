// Firebase configuration - Replace these with your Firebase project settings
const firebaseConfig = {
    apiKey: "AIzaSyCt7JCmc3SL9w_TvHWAXTbs6uPH1RVkbKE",
    authDomain: "queue-management-system-86aec.firebaseapp.com",
    databaseURL: "https://queue-management-system-86aec-default-rtdb.firebaseio.com",
    projectId: "queue-management-system-86aec",
    storageBucket: "queue-management-system-86aec.firebasestorage.app",
    messagingSenderId: "690840302833",
    appId: "1:690840302833:web:78c1cec75396c7be62e550",
    measurementId: "G-B3BBKQWSTN"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Reference to the database
const database = firebase.database();
const tokensRef = database.ref('tokens');
const counterRef = database.ref('counter');

// Global variables
let isDisplayPage = window.location.pathname.includes('display.html');

// DOM elements - only select those relevant to the current page
const elements = {
    generateToken: document.getElementById('generateToken'),
    callNext: document.getElementById('callNext'),
    lastToken: document.getElementById('lastToken'),
    currentToken: document.getElementById('currentToken'),
    queueContainer: document.getElementById('queueContainer'),
    currentlyServing: isDisplayPage ? document.getElementById('currentlyServing') : null,
    waitingQueue: isDisplayPage ? document.getElementById('waitingQueue') : null,
    timeDisplay: isDisplayPage ? document.getElementById('timeDisplay') : null
};

// Initialize the app
function initApp() {
    if (isDisplayPage) {
        initDisplayPage();
    } else {
        initControlPage();
    }
    
    // Listen for changes in the tokens collection
    listenForQueueChanges();
}

// Initialize control page (index.html)
function initControlPage() {
    // Generate token button event
    elements.generateToken.addEventListener('click', generateNewToken);
    
    // Call next button event
    elements.callNext.addEventListener('click', callNextPatient);
}

// Initialize display page (display.html)
function initDisplayPage() {
    // Update time every second
    updateTime();
    setInterval(updateTime, 1000);
}

// Update the current time display
function updateTime() {
    if (!elements.timeDisplay) return;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    elements.timeDisplay.textContent = `${dateString} - ${timeString}`;
}

// Generate a new token
function generateNewToken() {
    // Disable button temporarily to prevent double-clicks
    elements.generateToken.disabled = true;
    
    counterRef.transaction(function(currentCounter) {
        // If counter doesn't exist, start at 0
        return (currentCounter || 0) + 1;
    }, function(error, committed, snapshot) {
        if (error) {
            console.error('Transaction failed:', error);
        } else if (committed) {
            const newTokenNumber = snapshot.val();
            const timestamp = Date.now();
            
            // Create new token in database
            const newToken = {
                number: newTokenNumber,
                timestamp: timestamp,
                called: false
            };
            
            tokensRef.child(newTokenNumber.toString()).set(newToken)
                .then(() => {
                    console.log('New token generated:', newTokenNumber);
                    elements.lastToken.textContent = `Last token: ${newTokenNumber}`;
                    // Re-enable button
                    elements.generateToken.disabled = false;
                })
                .catch(error => {
                    console.error('Error saving token:', error);
                    elements.generateToken.disabled = false;
                });
        }
    });
}

// Call the next patient in the queue
function callNextPatient() {
    // Disable button temporarily
    elements.callNext.disabled = true;
    
    // Query for the oldest uncalled token
    tokensRef.orderByChild('timestamp')
        .once('value')
        .then(snapshot => {
            let oldestUncalledToken = null;
            
            snapshot.forEach(childSnapshot => {
                const token = childSnapshot.val();
                if (!token.called && (!oldestUncalledToken || token.timestamp < oldestUncalledToken.timestamp)) {
                    oldestUncalledToken = {
                        ...token,
                        key: childSnapshot.key
                    };
                }
            });
            
            if (oldestUncalledToken) {
                // Mark the token as called
                tokensRef.child(oldestUncalledToken.key).update({
                    called: true,
                    calledTimestamp: Date.now()
                })
                .then(() => {
                    console.log('Called token:', oldestUncalledToken.number);
                    elements.currentToken.textContent = `Current token: ${oldestUncalledToken.number}`;
                    
                    // Announce using Text-to-Speech
                    announceToken(oldestUncalledToken.number);
                    
                    // Re-enable button
                    elements.callNext.disabled = false;
                })
                .catch(error => {
                    console.error('Error updating token:', error);
                    elements.callNext.disabled = false;
                });
            } else {
                console.log('No tokens in queue');
                elements.currentToken.textContent = 'No patients in queue';
                elements.callNext.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error fetching tokens:', error);
            elements.callNext.disabled = false;
        });
}

// Announce token using Text-to-Speech
function announceToken(tokenNumber) {
    // Check if browser supports speech synthesis
    if ('speechSynthesis' in window) {
        const announcement = new SpeechSynthesisUtterance(`Token number ${tokenNumber}, please proceed`);
        
        // Optional: Customize voice properties
        announcement.volume = 1; // 0 to 1
        announcement.rate = 0.9; // 0.1 to 10
        announcement.pitch = 1; // 0 to 2
        
        window.speechSynthesis.speak(announcement);
    }
}

// Listen for real-time updates to the queue
function listenForQueueChanges() {
    tokensRef.orderByChild('timestamp').on('value', snapshot => {
        updateQueueDisplay(snapshot);
    });
}

// Update the queue display with the latest data
function updateQueueDisplay(snapshot) {
    const tokens = [];
    let lastCalledToken = null;
    let waitingCount = 0;
    
    // Convert to array and find the last called token
    snapshot.forEach(childSnapshot => {
        const token = childSnapshot.val();
        tokens.push(token);
        
        if (token.called) {
            if (!lastCalledToken || token.calledTimestamp > lastCalledToken.calledTimestamp) {
                lastCalledToken = token;
            }
        } else {
            waitingCount++;
        }
    });
    
    // Sort tokens by number for display
    tokens.sort((a, b) => a.number - b.number);
    
    // Update the control page queue preview
    if (elements.queueContainer) {
        updateControlQueuePreview(tokens, waitingCount);
    }
    
    // Update the display page
    if (isDisplayPage) {
        updateDisplayPageQueue(tokens, lastCalledToken);
    }
}

// Update the queue preview on the control page
function updateControlQueuePreview(tokens, waitingCount) {
    if (tokens.length === 0) {
        elements.queueContainer.innerHTML = '<p>No tokens in queue</p>';
        return;
    }
    
    let html = `<div class="queue-summary">Total tokens: ${tokens.length} | Waiting: ${waitingCount}</div>`;
    html += '<div class="token-list">';
    
    // Show the most recent tokens (limit to 10)
    const recentTokens = tokens.slice(-10);
    
    recentTokens.forEach(token => {
        const tokenClass = token.called ? 'token called' : 'token waiting';
        html += `<span class="${tokenClass}">${token.number}</span>`;
    });
    
    html += '</div>';
    elements.queueContainer.innerHTML = html;
}

// Update the full display page
function updateDisplayPageQueue(tokens, lastCalledToken) {
    // Update currently serving section
    if (elements.currentlyServing) {
        if (lastCalledToken) {
            elements.currentlyServing.innerHTML = `<div class="big-token">${lastCalledToken.number}</div>`;
        } else {
            elements.currentlyServing.innerHTML = '<div class="big-token">-</div>';
        }
    }
    
    // Update waiting queue section
    if (elements.waitingQueue) {
        if (tokens.length === 0) {
            elements.waitingQueue.innerHTML = '<p>No patients waiting</p>';
            return;
        }
        
        let html = '<div class="token-grid">';
        
        // Filter to show only waiting tokens
        const waitingTokens = tokens.filter(token => !token.called);
        
        if (waitingTokens.length === 0) {
            elements.waitingQueue.innerHTML = '<p>No patients waiting</p>';
            return;
        }
        
        waitingTokens.forEach(token => {
            html += `<div class="token-box">${token.number}</div>`;
        });
        
        html += '</div>';
        elements.waitingQueue.innerHTML = html;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', initApp);