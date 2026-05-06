import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    gamer?: {
      userId: string;
      username: string;
    };
  }
}
