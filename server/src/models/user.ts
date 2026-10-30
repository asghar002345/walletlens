import { Schema, model } from "mongoose";
import { createMemoryModel, isMemoryStore, idTransform } from "./memoryStore.js";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

const mongooseUser = model("User", userSchema);
/** Real Mongoose model, or the in-process demo store when WALLETLENS_STORE=memory (Vercel demo). */
export const User = isMemoryStore()
  ? (createMemoryModel({
      timestamps: true,
      hidden: ["passwordHash"],
      toJSON: (ret) => {
        const out = idTransform(ret);
        delete out.passwordHash;
        return out;
      },
    }) as unknown as typeof mongooseUser)
  : mongooseUser;
