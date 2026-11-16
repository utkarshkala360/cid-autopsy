import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// Generic atomic-sequence store — one document per named counter (e.g.
// `workitem:<teamId>`). Never decremented, so a value handed out is never
// reissued even if whatever it numbered gets deleted.
const CounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});

export type CounterDoc = InferSchemaType<typeof CounterSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Counter = models.Counter || model("Counter", CounterSchema);
