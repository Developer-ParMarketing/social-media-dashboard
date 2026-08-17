const mongoose = require("mongoose");

const FollowerSnapshotSchema = new mongoose.Schema({
    pageId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    fbFollowers: { type: Number, default: 0 },
    igFollowers: { type: Number, default: 0 },
}, { timestamps: true });

FollowerSnapshotSchema.index({ pageId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("FollowerSnapshot", FollowerSnapshotSchema);