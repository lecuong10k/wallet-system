-- Tạo Database
CREATE DATABASE IF NOT EXISTS wallet_system;
USE wallet_system;
-- Bảng lưu trữ số dư hiện tại của người dùng
CREATE TABLE IF NOT EXISTS wallets (
    user_id INT PRIMARY KEY,
    balance DECIMAL(18, 2) DEFAULT 0.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB;
-- Bảng lưu log tất cả giao dịch (Transaction Logs)
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    external_ref_id VARCHAR(100) NOT NULL,
    -- ID từ đối tác/ngân hàng
    user_id INT NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    type ENUM('DEPOSIT', 'WITHDRAW') NOT NULL,
    status ENUM('PENDING', 'SUCCESS', 'FAILED') DEFAULT 'SUCCESS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Unique constraint để đảm bảo Idempotency ở tầng DB
    UNIQUE KEY uk_external_ref (external_ref_id),
    INDEX idx_user (user_id)
) ENGINE = InnoDB;