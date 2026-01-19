import mongoose from 'mongoose';

export class MongoService {
    private static instance: MongoService;
    private isConnected: boolean = false;
    private constructor() {}

    public static getInstance(): MongoService {
        if (!MongoService.instance) {
            MongoService.instance = new MongoService();
        }
        return MongoService.instance;
    }

    async connect(uri?: string): Promise<boolean> {
        if (this.isConnected) {
            console.log('[MongoDB]connected');
            return true;
        }

        const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/openseo';

        try {
            await mongoose.connect(mongoUri);
            this.isConnected = true;
            return true;
        } catch (error: any) {
            console.error('[MongoDB] Connection error:', error.message);
            return false;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isConnected) {
            await mongoose.disconnect();
            this.isConnected = false;
            console.log('[MongoDB] Disconnected');
        }
    }

    getConnectionStatus(): boolean {
        return this.isConnected;
    }
}

export const mongoService = MongoService.getInstance();
