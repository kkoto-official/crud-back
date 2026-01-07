import { MigrationInterface, QueryRunner } from "typeorm";

export class AddImageUrlToUsers1756812000000 implements MigrationInterface {
    name = 'AddImageUrlToUsers1756812000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "imageUrl" character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "imageUrl"`);
    }
}

