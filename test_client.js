
const io = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected to server, requesting profile...');
    socket.emit('get_profile');
});

socket.on('profile_data', (data) => {
    // Check first 3 cards for category
    console.log('Sample Owned Cards:', data.ownedCardsDetails.slice(0, 3));
    setTimeout(() => {
        socket.disconnect();
        process.exit(0);
    }, 1000);
});

socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('Timeout');
    socket.disconnect();
    process.exit(0);
}, 5000);
