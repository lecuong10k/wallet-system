const walletRepository = require('../repository/walletRepository');
// Import model để sử dụng các hằng số tiêu chuẩn
const { TransactionStatus } = require('../models/transactionModel');

class WalletService {
    buildExistingTransactionResponse(status, userId, amount, refId) {
        const baseResponse = {
            status,
            external_ref_id: refId,
            user_id: userId,
            amount
        };

        switch (status) {
            case TransactionStatus.SUCCESS:
                return {
                    ...baseResponse,
                    message: 'Giao dịch đã được xử lý thành công trước đó (idempotent).',
                    duplicated: true,
                    statusCode: 200
                };
            case TransactionStatus.FAILED:
                return {
                    ...baseResponse,
                    message: 'Giao dịch trước đó đã thất bại. Vui lòng tạo giao dịch mới với mã tham chiếu khác.',
                    can_retry: true,
                    statusCode: 422
                };
            case TransactionStatus.PENDING:
                return {
                    ...baseResponse,
                    message: 'Giao dịch đang được xử lý. Vui lòng kiểm tra lại sau.',
                    statusCode: 202
                };
            default:
                return null;
        }
    }

    /**
     * Xử lý nạp tiền
     */
    async deposit(userId, amount, refId) {
        // 1. Kiểm tra Idempotency: Giao dịch đã tồn tại chưa?
        const existingTx = await walletRepository.findTransactionByRef(refId);

        if (existingTx) {
            const existingTxResponse = this.buildExistingTransactionResponse(
                existingTx.status,
                userId,
                amount,
                refId
            );

            if (existingTxResponse) {
                return existingTxResponse;
            }
        }

        // 2. Thực hiện nạp tiền
        return await walletRepository.executeDeposit(userId, amount, refId);
    }

    /**
     * Truy vấn số dư
     */
    async getBalance(userId) {
        console.log(`Fetching balance for user_id: ${userId}`);
        const wallet = await walletRepository.getBalanceByUserId(userId);
        console.log(`Balance retrieved from DB for user_id ${userId}:`, wallet);
        return wallet ? wallet.balance : 0;
    }

    /**
     * Đối soát giao dịch với dữ liệu ngân hàng
     */
    async reconcile(bankData) {
        if (!Array.isArray(bankData) || bankData.length === 0) {
            return { matched: 0, discrepancies: [] };
        }
        console.log(' ++  reconciliation process with bank data:', bankData);
        const refIds = bankData.map(item => item.ref_id);
        console.log(`Starting reconciliation for ${bankData.length} bank transactions. Ref IDs:`, refIds);
        const dbTransactions = await walletRepository.getAllTransactionsByRefs(refIds);
        console.log(`--> DB transactions retrieved for reconciliation:`, dbTransactions);
        if (dbTransactions.length === 0) {
            return {
                status: 'NO_MATCHES',
                message: 'Không tìm thấy giao dịch ngân hàng phù hợp hoặc không có dữ liệu để đối soát.',
                total_checked: bankData.length,
                matched: 0,
                discrepancies: []
            };
        }
        const dbMap = new Map(
            dbTransactions
                .map(tx => [tx.external_ref_id, tx.amount])
        );
        console.log(`DB Map for reconciliation:`, dbMap);
        const discrepancies = [];
        let matched = 0;

        for (const bankTx of bankData) {
            const dbAmount = dbMap.get(bankTx.ref_id);

            if (dbAmount === undefined) {
                discrepancies.push({
                    ref_id: bankTx.ref_id,
                    issue: 'MISSING_OR_NOT_SUCCESS_IN_DB'
                });
            } else if (parseFloat(dbAmount) !== parseFloat(bankTx.amount)) {
                discrepancies.push({
                    ref_id: bankTx.ref_id,
                    issue: 'AMOUNT_MISMATCH',
                    bank: bankTx.amount,
                    db: dbAmount
                });
            } else {
                matched++;
            }
        }

        return {
            total_checked: bankData.length,
            matched,
            discrepancies,
            reconciled_at: new Date().toISOString()
        };
    }
}

module.exports = new WalletService();