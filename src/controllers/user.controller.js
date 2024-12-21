import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {
    uploadOnCloudinary,
    deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessTokenAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        user.refreshToken = user.generateRefreshToken();
        await user.save({ validateBeforeSave: false });

        const accessToken = user.generateAccessToken();
        const refreshToken = user.refreshToken;

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Error generating token");
    }
};

const registerUser = asyncHandler(async (req, res, next) => {
    const {
        email,
        password,
        addressLine1,
        addressLine2,
        phone,
        role,
        firstName,
        lastName,
    } = req.body;

    if (["user", "seller", "admin"].indexOf(role) === -1) {
        throw new ApiError(400, "Invalid role");
    }

    if (
        [email, password, addressLine1, phone].some(
            (field) => (field == field.trim()) === ""
        )
    ) {
        throw new ApiError(400, "Missing required fields");
    }

    if (password.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters");
    }

    const existingUser = await User.findOne({
        $or: [{ email }, { phone }],
    });

    const fullName = `${firstName} ${lastName}`;
    const username = email.split("@")[0];
    const avatarLocalPath = req.file?.path;

    let avatarCloudinary;
    if (avatarLocalPath) {
        avatarCloudinary = await uploadOnCloudinary(avatarLocalPath);
    }

    if (!avatarCloudinary.url) {
        throw new ApiError(500, "Error uploading avatar");
    }

    if (existingUser) {
        throw new ApiError(400, "User already exists");
    }

    const user = await User.create({
        email,
        password,
        addressLine1,
        addressLine2: addressLine2 || "",
        phone,
        role,
        firstName,
        lastName,
        fullName,
        username,
        avatar: avatarCloudinary.url || "",
    });

    const createdUser = await User.findById(user._id).select("-password");

    return res
        .status(201)
        .json(new ApiResponse(201, createdUser, "User created successfully"));
});

const loginUser = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Missing required fields");
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
        throw new ApiError(401, "Invalid credentials");
    }

    const { accessToken, refreshToken } =
        await generateAccessTokenAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    const option = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged in successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    await User.findByIdAndUpdate(
        userId,
        {
            $unset: { refreshToken: 1 },
        },
        { new: true }
    );

    const option = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("refreshToken", option)
        .clearCookie("accessToken", option)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies.refreshToken || req.headers["x-refresh-token"];

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken._id);

        if (!user) {
            throw new ApiError(401, "Unauthorized request");
        }

        if (user.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Unauthorized request");
        }

        const { accessToken, newRefreshToken } =
            await generateAccessTokenAndRefreshToken(user._id);

        const option = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, option)
            .cookie("refreshToken", newRefreshToken, option)
            .json(
                new ApiResponse(
                    200,
                    {
                        accessToken,
                        newRefreshToken,
                    },
                    "Access Token refreshed successfully"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Unauthorized request");
    }
});

const changeCurrentUserPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isMatch = await user.comparePassword(oldPassword);

    if (!isMatch) {
        throw new ApiError(401, "Invalid credentials");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select(
        "-password -refreshToken"
    );

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(new ApiResponse(200, user, "User found"));
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentUserPassword,
    getCurrentUser,
};
