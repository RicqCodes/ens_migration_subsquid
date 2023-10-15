module.exports = class Data1697320655765 {
    name = 'Data1697320655765'

    async up(db) {
        await db.query(`ALTER TABLE "resolver" ALTER COLUMN "coin_types" DROP NOT NULL`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "resolver" ALTER COLUMN "coin_types" SET NOT NULL`)
    }
}
