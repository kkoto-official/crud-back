// Multer型定義の再エクスポート
// WindowsのDocker環境で型定義が解決されない問題を回避するため
/// <reference types="multer" />

export type MulterFile = Express.Multer.File;

