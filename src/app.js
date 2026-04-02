const express = require('express');
const walletController = require('./controllers/walletController');

const app = express();
app.use(express.json());

// Định nghĩa Routes
app.post('/api/v1/wallets', walletController.createWallet);
app.post('/api/v1/deposit', walletController.deposit);
app.get('/api/v1/balance/:userId', walletController.getBalance);
app.post('/api/v1/reconcile', walletController.reconcile);

// Health check cho Docker/Kubernetes
app.get('/health', (req, res) => res.send('OK'));

module.exports = app;