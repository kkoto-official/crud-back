import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from './config/typeorm.config';

const AppDataSource = new DataSource(typeOrmConfig);
export default AppDataSource;  // ← default export 必須
