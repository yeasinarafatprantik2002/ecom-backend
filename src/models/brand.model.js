import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    image: {
        type: String,
        default: "",
    },
    website: {
        type: String,
        default: "",
    },
    phone: {
        type: String,
        default: "",
    },
    email: {
        type: String,
        default: "",
    },
    address: {
        type: String,
        default: "",
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active",
    },
},{ timestamps: true });

brandSchema.plugin(mongooseAggregatePaginate);

export const Brand = mongoose.model("Brand", brandSchema);