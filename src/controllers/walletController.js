const walletService = require('../services/walletService');
class WalletController {
    async createWallet(req, res) {
        try {
            const { user_id } = req.body;
            const result = await walletService.createWalletAccount(user_id);
            res.status(result.statusCode || 200).json(result);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    async deposit(req, res) {
        try {
            const { user_id, amount, external_ref_id } = req.body;

            if (!user_id || !amount || !external_ref_id) {
                return res.status(400).json({ error: "Missing money information" });
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
            const result = await walletService.getBalance(userId);

            if (!result.status) {
                return res.status(404).json(result);
            }

            res.status(200).json(result);
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