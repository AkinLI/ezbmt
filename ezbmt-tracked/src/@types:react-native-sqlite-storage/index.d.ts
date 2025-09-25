declare module 'react-native-sqlite-storage' {
export type SQLResultSetRow = { [key: string]: any };

export type SQLResultSet = {
rows: {
length: number;
item: (index: number) => SQLResultSetRow;
};
insertId?: number;
rowsAffected?: number;
};

export interface SQLiteDatabase {
executeSql: (sqlStatement: string, args?: any[]) => Promise<[SQLResultSet]>;
close: () => Promise<void>;
}

// default export 物件
const SQLiteDefault: {
enablePromise: (enable: boolean) => void;
openDatabase: (
config:
| { name: string; location?: 'default' | 'Library' | 'Documents' }
| string
) => Promise<SQLiteDatabase>;
};

// 額外提供命名空間（讓 SQLite.SQLiteDatabase 也可用）
export as namespace SQLite;
export { SQLiteDatabase };
export default SQLiteDefault;
}


