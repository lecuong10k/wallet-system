const pool = require('../config/db');
const { TransactionStatus } = require('../models/transactionModel');
class WalletRepository {
    async createWalletAccount(userId) {
        try {
            await pool.execute(
                'INSERT INTO wallets (user_id, balance) VALUES (?, 0.00)',
                [userId]
            );

            return {
                status: true,
                message: 'Wallet account created successfully.',
                user_id: userId,
                balance: 0,
                statusCode: 201
            };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return {
                    status: false,
                    message: `Wallet already exists for user_id ${userId}.`,
                    user_id: userId,
                    statusCode: 409
                };
            }
            throw error;
        }
    }

    // Tìm giao dịch theo mã tham chiếu ngoài (để check trùng)
    async findTransactionByRef(refId) {
        const [rows] = await pool.execute(
            'SELECT * FROM transactions WHERE external_ref_id = ?',
            [refId]
        );
        return rows[0];
    }

    // Lấy số dư hiện tại
    async getBalanceByUserId(userId) {
        try {
            const [rows] = await pool.execute(
                'SELECT balance FROM wallets WHERE user_id = ?',
                [userId]
            );
            return rows[0];
        } catch (error) {
            console.error(`Error fetching balance for user_id ${userId}:`, error);
            throw error;
        }
    }

    // Thực hiện nạp tiền sử dụng Transaction để đảm bảo tính nguyên tử
    async executeDeposit(userId, amount, refId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Ghi log giao dịch
            await connection.execute(
                'INSERT INTO transactions (external_ref_id, user_id, amount, type, status) VALUES (?, ?, ?, "DEPOSIT", ?)',
                [refId, userId, amount, TransactionStatus.PENDING]
            );

            // 2. Kiểm tra ví tồn tại
            const [walletRows] = await connection.execute(
                'SELECT user_id FROM wallets WHERE user_id = ? FOR UPDATE',
                [userId]
            );

            if (walletRows.length === 0) {
                await connection.rollback();
                await connection.execute(
                    'UPDATE transactions SET status = ? WHERE external_ref_id = ?',
                    [TransactionStatus.FAILED, refId]
                );
                await connection.commit();
                return {
                    status: TransactionStatus.FAILED,
                    message: `No wallet found for user_id ${userId}.`,
                    external_ref_id: refId,
                    user_id: userId,
                    amount,
                    statusCode: 404
                };
            }

            // 3. Cập nhật số dư
            await connection.execute(
                'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                [amount, userId]
            );

            await connection.execute(
                'UPDATE transactions SET status = ? WHERE external_ref_id = ?',
                [TransactionStatus.SUCCESS, refId]
            );

            await connection.commit();
            return {
                status: TransactionStatus.SUCCESS,
                message: 'Nạp tiền thành công.',
                external_ref_id: refId,
                user_id: userId,
                amount,
                duplicated: false,
                statusCode: 200
            };
        } catch (error) {
            await connection.rollback();

            if (error.code === 'ER_DUP_ENTRY') {
                const existing = await this.findTransactionByRef(refId);
                if (existing) {
                    if (existing.status === TransactionStatus.PENDING) {
                        return {
                            status: TransactionStatus.PENDING,
                            message: 'The transaction is being processed. Please check back later.',
                            external_ref_id: refId,
                            user_id: userId,
                            amount,
                            statusCode: 202
                        };
                    }

                    if (existing.status === TransactionStatus.SUCCESS) {
                        return {
                            status: TransactionStatus.SUCCESS,
                            message: 'The transaction has been successfully processed before (idempotent).',
                            external_ref_id: refId,
                            user_id: userId,
                            amount,
                            duplicated: true,
                            statusCode: 200
                        };
                    }

                    return {
                        status: TransactionStatus.FAILED,
                        message: 'The previous transaction has failed. Please create a new transaction with a different reference ID.',
                        external_ref_id: refId,
                        user_id: userId,
                        amount,
                        can_retry: true,
                        statusCode: 422
                    };
                }
            }

            return {
                status: TransactionStatus.FAILED,
                message: 'The transaction failed due to a system error. Please try again later.',
                external_ref_id: refId,
                user_id: userId,
                amount,
                error_code: error.code || 'UNKNOWN_ERROR',
                can_retry: true,
                statusCode: 500
            };
        } finally {
            connection.release();
        }
    }

    // Query phục vụ cho module đối soát
    async getAllTransactionsByRefs(refIds) {
        if (!refIds.length) return [];
        console.log(`=====> Querying DB for reconciliation. Ref IDs:`, refIds);
        const [rows] = await pool.query(
            'SELECT external_ref_id, amount FROM transactions WHERE external_ref_id IN (?)',
            [refIds]
        );
        return rows;
    }
}

module.exports = new WalletRepository();