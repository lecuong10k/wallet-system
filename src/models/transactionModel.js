// models/transactionModel.js
const TransactionType = {
    DEPOSIT: 'DEPOSIT',
    WITHDRAW: 'WITHDRAW'
};

const TransactionStatus = {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    PENDING: 'PENDING'
};

module.exports = { TransactionType, TransactionStatus };