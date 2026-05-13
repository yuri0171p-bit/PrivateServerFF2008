// api/PlatformRegister.js
module.exports = (req, res) => {
    // Mesma resposta que guestAuth
    require('./guestAuth.js')(req, res);
};
