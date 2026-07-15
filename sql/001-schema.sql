-- ============================================================
-- 佳瑞物流管理系统 V2.0 - 完整建表脚本
-- 数据库: PostgreSQL 15+ (需预先安装 PostGIS 扩展)
-- 编码: UTF-8
-- ============================================================

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 客户表
-- ============================================================
CREATE TABLE customer (
    id               BIGSERIAL PRIMARY KEY,
    customer_code    VARCHAR(32)  NOT NULL UNIQUE,
    company_name     VARCHAR(128) NOT NULL,
    short_name       VARCHAR(64),
    contact_name     VARCHAR(32),
    contact_phone    VARCHAR(20),
    province         VARCHAR(32),
    city             VARCHAR(32),
    district         VARCHAR(32),
    address_detail   VARCHAR(256),
    settlement_type  VARCHAR(16)  NOT NULL DEFAULT 'monthly',
    credit_limit     DECIMAL(12,2),
    tax_id           VARCHAR(32),
    discount_rate    DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    status           SMALLINT     NOT NULL DEFAULT 1,
    remark           VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customer IS '客户档案表';
COMMENT ON COLUMN customer.settlement_type IS '结算方式: monthly=月结, per_trip=趟结, prepaid=预付';
COMMENT ON COLUMN customer.credit_limit IS '月结客户授信额度(元)';
COMMENT ON COLUMN customer.discount_rate IS '合同折扣率, 1.00=原价, 0.85=八五折';
COMMENT ON COLUMN customer.status IS '1=正常, 0=停用';

-- ============================================================
-- 2. 客户常用地址库
-- ============================================================
CREATE TABLE address_book (
    id               BIGSERIAL PRIMARY KEY,
    customer_id      BIGINT       NOT NULL REFERENCES customer(id),
    address_name     VARCHAR(64)  NOT NULL,
    contact_name     VARCHAR(32),
    contact_phone    VARCHAR(20),
    province         VARCHAR(32)  NOT NULL,
    city             VARCHAR(32)  NOT NULL,
    district         VARCHAR(32)  NOT NULL,
    address_detail   VARCHAR(256) NOT NULL,
    longitude        DECIMAL(10,7),
    latitude         DECIMAL(10,7),
    is_default       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_address_customer ON address_book(customer_id);

COMMENT ON TABLE address_book IS '客户常用收货/发货地址库';
COMMENT ON COLUMN address_book.longitude IS '经度(腾讯地图坐标系 GCJ-02)';
COMMENT ON COLUMN address_book.latitude IS '纬度(腾讯地图坐标系 GCJ-02)';

-- ============================================================
-- 3. 车辆表
-- ============================================================
CREATE TABLE vehicle (
    id                     BIGSERIAL PRIMARY KEY,
    vehicle_code           VARCHAR(32)  NOT NULL UNIQUE,
    plate_number           VARCHAR(16)  NOT NULL,
    vehicle_type           VARCHAR(16)  NOT NULL,
    brand_model            VARCHAR(64),
    max_load_kg            DECIMAL(10,2),
    max_volume_m3          DECIMAL(8,2),
    length_m               DECIMAL(4,1),
    gps_device_id          VARCHAR(64),
    fuel_type              VARCHAR(16),
    fuel_cost_per_100km    DECIMAL(8,3),
    monthly_depreciation   DECIMAL(10,2) NOT NULL DEFAULT 0,
    monthly_insurance      DECIMAL(10,2) NOT NULL DEFAULT 0,
    current_driver_id      BIGINT,
    status                 VARCHAR(16)  NOT NULL DEFAULT 'idle',
    purchase_date          DATE,
    remark                 VARCHAR(512),
    created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicle_status ON vehicle(status);
CREATE INDEX idx_vehicle_type   ON vehicle(vehicle_type);

COMMENT ON TABLE vehicle IS '车辆档案表';
COMMENT ON COLUMN vehicle.vehicle_type IS '车型: small_truck=小面, medium_truck=4.2米, heavy_truck=6.8米及以上';
COMMENT ON COLUMN vehicle.fuel_type IS '燃油: diesel=柴油, gas=汽油, electric=电动';
COMMENT ON COLUMN vehicle.fuel_cost_per_100km IS '百公里油耗参考值(升)';
COMMENT ON COLUMN vehicle.monthly_depreciation IS '月折旧额, 用于成本分摊';
COMMENT ON COLUMN vehicle.monthly_insurance IS '月保险费用均摊';
COMMENT ON COLUMN vehicle.status IS 'idle=空闲, en_route=运输中, maintenance=维修, retired=报废';

-- ============================================================
-- 4. 司机表
-- ============================================================
CREATE TABLE driver (
    id               BIGSERIAL PRIMARY KEY,
    driver_code      VARCHAR(32)  NOT NULL UNIQUE,
    name             VARCHAR(32)  NOT NULL,
    phone            VARCHAR(20)  NOT NULL,
    id_card          VARCHAR(18),
    license_type     VARCHAR(8),
    license_expiry   DATE,
    wechat_openid    VARCHAR(64),
    status           VARCHAR(16)  NOT NULL DEFAULT 'available',
    hired_date       DATE,
    remark           VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE driver IS '司机档案表';
COMMENT ON COLUMN driver.license_type IS '驾照类型: A1/A2/B1/B2/C1';
COMMENT ON COLUMN driver.wechat_openid IS '微信小程序openid, 用于司机端登录';
COMMENT ON COLUMN driver.status IS 'available=可派车, on_trip=运输中, leave=请假, resigned=离职';

-- ============================================================
-- 5. 司机-车辆绑定关系表
-- ============================================================
CREATE TABLE driver_vehicle (
    id               BIGSERIAL PRIMARY KEY,
    driver_id        BIGINT       NOT NULL REFERENCES driver(id),
    vehicle_id       BIGINT       NOT NULL REFERENCES vehicle(id),
    bound_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    unbound_at       TIMESTAMP,
    UNIQUE (driver_id, vehicle_id, bound_at)
);

CREATE INDEX idx_dv_driver  ON driver_vehicle(driver_id);
CREATE INDEX idx_dv_vehicle ON driver_vehicle(vehicle_id);

COMMENT ON TABLE driver_vehicle IS '司机与车辆绑定关系(松绑定, 支持换车)';

-- ============================================================
-- 6. 系统用户表
-- ============================================================
CREATE TABLE sys_user (
    id               BIGSERIAL PRIMARY KEY,
    username         VARCHAR(32)  NOT NULL UNIQUE,
    password_hash    VARCHAR(128) NOT NULL,
    display_name     VARCHAR(32),
    phone            VARCHAR(20),
    role             VARCHAR(16)  NOT NULL,
    customer_id      BIGINT,
    driver_id        BIGINT,
    status           SMALLINT     NOT NULL DEFAULT 1,
    last_login_at    TIMESTAMP,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sys_user IS '系统用户表(统一登录入口)';
COMMENT ON COLUMN sys_user.role IS '角色: admin=管理员, dispatcher=调度员, finance=财务, customer=客户, driver=司机';
COMMENT ON COLUMN sys_user.customer_id IS '当 role=customer 时关联客户ID';
COMMENT ON COLUMN sys_user.driver_id IS '当 role=driver 时关联司机ID';
COMMENT ON COLUMN sys_user.status IS '1=正常, 0=禁用';

-- ============================================================
-- 7. 操作审计日志
-- ============================================================
CREATE TABLE sys_audit_log (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT       NOT NULL,
    username         VARCHAR(32)  NOT NULL,
    action           VARCHAR(64)  NOT NULL,
    target_type      VARCHAR(32),
    target_id        BIGINT,
    detail           JSONB,
    ip_address       VARCHAR(45),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user   ON sys_audit_log(user_id);
CREATE INDEX idx_audit_target ON sys_audit_log(target_type, target_id);
CREATE INDEX idx_audit_time   ON sys_audit_log(created_at DESC);

COMMENT ON TABLE sys_audit_log IS '操作审计日志';

-- ============================================================
-- 8. 运单表 (核心业务表)
-- ============================================================
CREATE TABLE waybill (
    id                    BIGSERIAL PRIMARY KEY,
    waybill_no            VARCHAR(32)  NOT NULL UNIQUE,
    customer_id           BIGINT       NOT NULL REFERENCES customer(id),

    -- 货物信息
    cargo_name            VARCHAR(128) NOT NULL,
    cargo_type            VARCHAR(32),
    cargo_weight_kg       DECIMAL(10,2),
    cargo_volume_m3       DECIMAL(8,2),
    cargo_pieces          INTEGER,
    cargo_remark          VARCHAR(256),

    -- 时间要求
    pickup_time_from      TIMESTAMP,
    pickup_time_to        TIMESTAMP,
    delivery_time_from    TIMESTAMP,
    delivery_time_to      TIMESTAMP,
    time_requirement      VARCHAR(16)  NOT NULL DEFAULT 'normal',

    -- 费用信息
    quoted_fee            DECIMAL(10,2) NOT NULL,
    settlement_status     VARCHAR(16)  NOT NULL DEFAULT 'pending',

    -- 状态与流转
    status                VARCHAR(16)  NOT NULL DEFAULT 'draft',
    dispatch_type         VARCHAR(16)  NOT NULL DEFAULT 'full_load',

    -- 运行数据
    actual_depart_time    TIMESTAMP,
    actual_arrive_time    TIMESTAMP,
    signed_status         VARCHAR(16)  NOT NULL DEFAULT 'unsigned',
    signed_at             TIMESTAMP,

    -- 审计
    created_by            BIGINT,
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waybill_customer    ON waybill(customer_id);
CREATE INDEX idx_waybill_status      ON waybill(status);
CREATE INDEX idx_waybill_created     ON waybill(created_at DESC);
CREATE INDEX idx_waybill_delivery    ON waybill(delivery_time_to);
CREATE INDEX idx_waybill_settlement  ON waybill(customer_id, settlement_status);

COMMENT ON TABLE waybill IS '运单主表: 系统核心业务表';
COMMENT ON COLUMN waybill.cargo_type IS '货物类型: general=普通, fragile=易碎, dangerous=危险品, cold_chain=冷链';
COMMENT ON COLUMN waybill.time_requirement IS '时效: normal=普通, urgent=加急, appointed=预约';
COMMENT ON COLUMN waybill.dispatch_type IS '调度类型: full_load=整车, ltl_shared=零担拼车';
COMMENT ON COLUMN waybill.status IS '运单状态: draft/confirmed/scheduled/loaded/in_transit/arrived/signed/completed/cancelled/exception';
COMMENT ON COLUMN waybill.settlement_status IS '结算状态: pending=待结算, invoiced=已开票, paid=已付款';
COMMENT ON COLUMN waybill.signed_status IS '签收状态: unsigned=未签收, partial=部分签收, full=全部签收';

-- ============================================================
-- 9. 运单站点表 (多站点装卸 - V2.0 核心新增)
-- ============================================================
CREATE TABLE waybill_stop (
    id               BIGSERIAL PRIMARY KEY,
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    stop_seq         SMALLINT     NOT NULL,
    stop_type        VARCHAR(16)  NOT NULL,
    company_name     VARCHAR(128),
    contact_name     VARCHAR(32),
    contact_phone    VARCHAR(20),
    province         VARCHAR(32)  NOT NULL,
    city             VARCHAR(32)  NOT NULL,
    district         VARCHAR(32)  NOT NULL,
    address_detail   VARCHAR(256) NOT NULL,
    longitude        DECIMAL(10,7),
    latitude         DECIMAL(10,7),
    planned_arrive   TIMESTAMP,
    actual_arrive    TIMESTAMP,
    cargo_desc       VARCHAR(256),
    status           VARCHAR(16)  NOT NULL DEFAULT 'pending',
    signed_at        TIMESTAMP,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (waybill_id, stop_seq)
);

CREATE INDEX idx_stop_waybill ON waybill_stop(waybill_id);

COMMENT ON TABLE waybill_stop IS '运单停靠站点: 支持多点提货+多点卸货, 排线算法核心输入';
COMMENT ON COLUMN waybill_stop.stop_seq IS '停靠顺序, 从1开始';
COMMENT ON COLUMN waybill_stop.stop_type IS 'pickup=提货, delivery=卸货';
COMMENT ON COLUMN waybill_stop.status IS 'pending=待到达, arrived=已到达, loaded=已装货, unloaded=已卸货, signed=已签收';

-- ============================================================
-- 10. 运单-车辆关联表 (支持拼车)
-- ============================================================
CREATE TABLE waybill_vehicle (
    id               BIGSERIAL PRIMARY KEY,
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    vehicle_id       BIGINT       NOT NULL REFERENCES vehicle(id),
    driver_id        BIGINT,
    assigned_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (waybill_id, vehicle_id, assigned_at)
);

CREATE INDEX idx_wv_waybill  ON waybill_vehicle(waybill_id);
CREATE INDEX idx_wv_vehicle  ON waybill_vehicle(vehicle_id);

COMMENT ON TABLE waybill_vehicle IS '运单与车辆关联(多运单可拼一车)';

-- ============================================================
-- 11. GPS 轨迹表
-- ============================================================
CREATE TABLE gps_record (
    id               BIGSERIAL PRIMARY KEY,
    vehicle_id       BIGINT       NOT NULL,
    waybill_id       BIGINT,
    longitude        DECIMAL(10,7) NOT NULL,
    latitude         DECIMAL(10,7) NOT NULL,
    speed_kmh        DECIMAL(5,1),
    direction        SMALLINT,
    device_time      TIMESTAMP    NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gps_vehicle_time ON gps_record(vehicle_id, device_time DESC);
CREATE INDEX idx_gps_waybill       ON gps_record(waybill_id);
CREATE INDEX idx_gps_device_time   ON gps_record(device_time);

COMMENT ON TABLE gps_record IS 'GPS轨迹数据: vehicle_id记录硬件归属, waybill_id通过时间窗口匹配填充';

-- ============================================================
-- 12. 直接费用明细表
-- ============================================================
CREATE TABLE cost_item (
    id               BIGSERIAL PRIMARY KEY,
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    cost_type        VARCHAR(32)  NOT NULL,
    cost_amount      DECIMAL(10,2) NOT NULL,
    cost_desc        VARCHAR(256),
    receipt_image    VARCHAR(256),
    occurred_at      TIMESTAMP,
    recorded_by      BIGINT,
    verified_by      BIGINT,
    verify_status    VARCHAR(16)  NOT NULL DEFAULT 'pending',
    reject_reason    VARCHAR(256),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_waybill ON cost_item(waybill_id);
CREATE INDEX idx_cost_type    ON cost_item(cost_type);
CREATE INDEX idx_cost_verify  ON cost_item(verify_status);

COMMENT ON TABLE cost_item IS '直接费用明细(油费/过路费/司机提成等, 直接归属运单)';
COMMENT ON COLUMN cost_item.cost_type IS '费用类型: fuel=油费, toll=过路费, driver_pay=司机提成, loading=装卸费, penalty=罚款, other=其他';
COMMENT ON COLUMN cost_item.verify_status IS '审核状态: pending=待审核, verified=已审核, rejected=已驳回';

-- ============================================================
-- 13. 间接成本分摊规则表
-- ============================================================
CREATE TABLE cost_allocation (
    id               BIGSERIAL PRIMARY KEY,
    vehicle_id       BIGINT       NOT NULL REFERENCES vehicle(id),
    cost_type        VARCHAR(32)  NOT NULL,
    total_amount     DECIMAL(12,2) NOT NULL,
    period_start     DATE         NOT NULL,
    period_end       DATE         NOT NULL,
    alloc_rule       VARCHAR(32)  NOT NULL DEFAULT 'per_trip',
    remark           VARCHAR(256),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alloc_vehicle ON cost_allocation(vehicle_id);
CREATE INDEX idx_alloc_period  ON cost_allocation(period_start, period_end);

COMMENT ON TABLE cost_allocation IS '间接成本分摊规则: 折旧/保险/维修等按月汇总后分摊到每趟';
COMMENT ON COLUMN cost_allocation.cost_type IS '费用类型: depreciation=折旧, insurance=保险, maintenance=维修, annual_fee=年检';
COMMENT ON COLUMN cost_allocation.alloc_rule IS '分摊方式: per_trip=按趟均摊, by_mileage=按里程占比';

-- ============================================================
-- 14. 间接成本分摊明细表
-- ============================================================
CREATE TABLE cost_allocation_detail (
    id               BIGSERIAL PRIMARY KEY,
    allocation_id    BIGINT       NOT NULL REFERENCES cost_allocation(id),
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    allocated_amount DECIMAL(10,2) NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (allocation_id, waybill_id)
);

CREATE INDEX idx_alloc_detail_waybill ON cost_allocation_detail(waybill_id);

COMMENT ON TABLE cost_allocation_detail IS '间接成本分摊到每趟运单的明细';

-- ============================================================
-- 15. 运单成本快照表 (防篡改 + 历史追溯)
-- ============================================================
CREATE TABLE waybill_cost_snapshot (
    id                     BIGSERIAL PRIMARY KEY,
    waybill_id             BIGINT       NOT NULL UNIQUE REFERENCES waybill(id),
    quoted_fee             DECIMAL(10,2) NOT NULL,
    direct_fuel            DECIMAL(10,2) NOT NULL DEFAULT 0,
    direct_toll            DECIMAL(10,2) NOT NULL DEFAULT 0,
    direct_driver_pay      DECIMAL(10,2) NOT NULL DEFAULT 0,
    direct_loading         DECIMAL(10,2) NOT NULL DEFAULT 0,
    direct_other           DECIMAL(10,2) NOT NULL DEFAULT 0,
    indirect_depreciation  DECIMAL(10,2) NOT NULL DEFAULT 0,
    indirect_insurance     DECIMAL(10,2) NOT NULL DEFAULT 0,
    indirect_maintenance   DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_cost             DECIMAL(10,2) NOT NULL,
    profit                 DECIMAL(10,2) NOT NULL,
    profit_margin          DECIMAL(5,2),
    calculated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE waybill_cost_snapshot IS '运单成本快照: 签收完成后生成, 一次性写入不再修改, 防止历史数据被篡改';

-- ============================================================
-- 16. 签收记录表
-- ============================================================
CREATE TABLE sign_record (
    id               BIGSERIAL PRIMARY KEY,
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    waybill_stop_id  BIGINT,
    sign_type        VARCHAR(16)  NOT NULL,
    sign_name        VARCHAR(32),
    sign_phone       VARCHAR(20),
    sign_image_url   VARCHAR(256),
    sign_longitude   DECIMAL(10,7),
    sign_latitude    DECIMAL(10,7),
    remark           VARCHAR(256),
    signed_at        TIMESTAMP    NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sign_waybill ON sign_record(waybill_id);

COMMENT ON TABLE sign_record IS '签收记录: 支持电子签名/拍照签收/短信码签收/扫码签收';
COMMENT ON COLUMN sign_record.sign_type IS '签收方式: electronic=电子签名, photo=拍照, sms_code=短信验证码, qr_scan=扫码签收';

-- ============================================================
-- 17. 异常工单表
-- ============================================================
CREATE TABLE exception_record (
    id               BIGSERIAL PRIMARY KEY,
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    exception_type   VARCHAR(32)  NOT NULL,
    severity         VARCHAR(16)  NOT NULL DEFAULT 'normal',
    reported_by      BIGINT       NOT NULL,
    reported_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    description      TEXT         NOT NULL,
    image_urls       TEXT,
    handler_id       BIGINT,
    handle_status    VARCHAR(16)  NOT NULL DEFAULT 'open',
    handle_result    TEXT,
    handle_remark    TEXT,
    sla_deadline     TIMESTAMP,
    resolved_at      TIMESTAMP,
    escalated_at     TIMESTAMP,
    escalated_to     BIGINT,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exception_waybill ON exception_record(waybill_id);
CREATE INDEX idx_exception_status   ON exception_record(handle_status);
CREATE INDEX idx_exception_severity ON exception_record(severity);

COMMENT ON TABLE exception_record IS '异常工单: 运输异常上报与处理跟踪';
COMMENT ON COLUMN exception_record.exception_type IS '异常类型: delay=延误, cargo_damage=货损, customer_reject=客户拒收, accident=事故, lost=丢失, other=其他';
COMMENT ON COLUMN exception_record.severity IS '严重级别: normal=一般, serious=严重, critical=重大';
COMMENT ON COLUMN exception_record.handle_status IS '处理状态: open=待处理, handling=处理中, resolved=已解决, closed=已关闭';

-- ============================================================
-- 18. 报价规则表
-- ============================================================
CREATE TABLE pricing_rule (
    id               BIGSERIAL PRIMARY KEY,
    vehicle_type     VARCHAR(16)  NOT NULL,
    base_fee         DECIMAL(10,2) NOT NULL,
    price_per_km     DECIMAL(8,3)  NOT NULL,
    price_per_kg     DECIMAL(8,3)  NOT NULL DEFAULT 0,
    min_charge       DECIMAL(10,2) NOT NULL,
    effective_from   DATE         NOT NULL,
    effective_to     DATE,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pricing_rule IS '运费报价规则配置';

-- ============================================================
-- 19. 对账单主表
-- ============================================================
CREATE TABLE billing_statement (
    id               BIGSERIAL PRIMARY KEY,
    statement_no     VARCHAR(32)  NOT NULL UNIQUE,
    customer_id      BIGINT       NOT NULL REFERENCES customer(id),
    period_start     DATE         NOT NULL,
    period_end       DATE         NOT NULL,
    total_amount     DECIMAL(12,2) NOT NULL,
    waybill_count    INTEGER      NOT NULL,
    status           VARCHAR(16)  NOT NULL DEFAULT 'draft',
    confirmed_at     TIMESTAMP,
    invoiced_at      TIMESTAMP,
    invoice_no       VARCHAR(64),
    paid_at          TIMESTAMP,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_customer ON billing_statement(customer_id);
CREATE INDEX idx_billing_period   ON billing_statement(period_start, period_end);
CREATE INDEX idx_billing_status   ON billing_statement(status);

COMMENT ON TABLE billing_statement IS '月结对账单主表';
COMMENT ON COLUMN billing_statement.status IS 'draft=草稿, sent=已发送, confirmed=已确认, disputed=争议中, invoiced=已开票, paid=已付款';

-- ============================================================
-- 20. 对账单明细表
-- ============================================================
CREATE TABLE billing_item (
    id               BIGSERIAL PRIMARY KEY,
    statement_id     BIGINT       NOT NULL REFERENCES billing_statement(id),
    waybill_id       BIGINT       NOT NULL REFERENCES waybill(id),
    waybill_no       VARCHAR(32)  NOT NULL,
    departure        VARCHAR(128),
    destination      VARCHAR(128),
    cargo_desc       VARCHAR(128),
    amount           DECIMAL(10,2) NOT NULL,
    trip_date        DATE,
    UNIQUE (statement_id, waybill_id)
);

CREATE INDEX idx_billing_item_statement ON billing_item(statement_id);

COMMENT ON TABLE billing_item IS '对账单明细: 一条对一个运单';

-- ============================================================
-- 21. 争议记录表
-- ============================================================
CREATE TABLE dispute_record (
    id               BIGSERIAL PRIMARY KEY,
    statement_id     BIGINT       NOT NULL REFERENCES billing_statement(id),
    billing_item_id  BIGINT       NOT NULL REFERENCES billing_item(id),
    disputed_by      BIGINT       NOT NULL,
    reason           TEXT         NOT NULL,
    handler_id       BIGINT,
    handle_result    TEXT,
    handle_status    VARCHAR(16)  NOT NULL DEFAULT 'open',
    resolved_at      TIMESTAMP,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dispute_record IS '对账争议记录';

-- ============================================================
-- 22. 通知日志表
-- ============================================================
CREATE TABLE notification_log (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT       NOT NULL,
    notify_type      VARCHAR(32)  NOT NULL,
    channel          VARCHAR(16)  NOT NULL,
    title            VARCHAR(128),
    content          TEXT,
    template_id      VARCHAR(64),
    send_status      VARCHAR(16)  NOT NULL DEFAULT 'pending',
    read_status      VARCHAR(16)  NOT NULL DEFAULT 'unread',
    send_at          TIMESTAMP,
    read_at          TIMESTAMP,
    error_msg        VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notify_user   ON notification_log(user_id);
CREATE INDEX idx_notify_status ON notification_log(send_status);

COMMENT ON TABLE notification_log IS '消息通知日志: 记录所有推送给用户的通知';
COMMENT ON COLUMN notification_log.channel IS '通知渠道: wechat_tpl=微信模板消息, sms=短信, dingtalk=钉钉, in_app=站内通知';
COMMENT ON COLUMN notification_log.send_status IS '发送状态: pending=待发送, sent=已发送, failed=失败';
COMMENT ON COLUMN notification_log.read_status IS '阅读状态: unread=未读, read=已读';

-- ============================================================
-- 完成提示
-- ============================================================
-- 执行方式: psql -h localhost -U postgres -d jiarui_logistics -f 001-schema.sql
-- 验证: SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
