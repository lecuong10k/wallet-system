const pool = require('../config/db');
const { TransactionStatus } = require('../models/transactionModel');
class WalletRepository {
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

            // 2. Cập nhật số dư (Upsert logic)
            await connection.execute(
                'INSERT INTO wallets (user_id, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?',
                [userId, amount, amount]
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
                            message: 'Giao dịch đang được xử lý. Vui lòng kiểm tra lại sau.',
                            external_ref_id: refId,
                            user_id: userId,
                            amount,
                            statusCode: 202
                        };
                    }

                    if (existing.status === TransactionStatus.SUCCESS) {
                        return {
                            status: TransactionStatus.SUCCESS,
                            message: 'Giao dịch đã được xử lý thành công trước đó (idempotent).',
                            external_ref_id: refId,
                            user_id: userId,
                            amount,
                            duplicated: true,
                            statusCode: 200
                        };
                    }

                    return {
                        status: TransactionStatus.FAILED,
                        message: 'Giao dịch trước đó đã thất bại. Vui lòng tạo giao dịch mới với mã tham chiếu khác.',
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
                message: 'Giao dịch thất bại do lỗi hệ thống. Vui lòng thử lại sau.',
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