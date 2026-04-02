const walletService = require('../services/walletService');
class WalletController {
    async deposit(req, res) {
        try {
            const { user_id, amount, external_ref_id } = req.body;

            if (!user_id || !amount || !external_ref_id) {
                return res.status(400).json({ error: "Thiếu thông tin nạp tiền" });
            }

            const result = await walletService.deposit(user_id, amount, external_ref_id);
            res.status(result.statusCode || 200).json(result);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    async getBalance(req, res) {
        try {
            const userId = req.params.userId;
            const balance = await walletService.getBalance(userId);
            console.log(`- Balance for user_id ${userId}: ${balance}`);
            res.status(200).json({ user_id: userId, balance });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async reconcile(req, res) {
        try {
            const { bank_data } = req.body;
            const result = await walletService.reconcile(bank_data);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WalletController();