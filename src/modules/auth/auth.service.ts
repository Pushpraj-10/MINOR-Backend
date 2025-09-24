import prisma from "../../config/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { LoginSchema, StudentRegisterSchema, ProfessorRegisterSchema } from "./auth.validation";

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const REFRESH_TOKEN_EXPIRES_IN = "7d";
const JWT_EXPIRES_IN = "15m";

if (!JWT_SECRET || !REFRESH_TOKEN_EXPIRES_IN || !JWT_EXPIRES_IN) {
    throw new Error("JWT_SECRET, JWT_EXPIRES_IN or REFRESH_TOKEN_EXPIRES_IN is not defined");
}

export class AuthService {
    static async registerStudent(data: StudentRegisterSchema) {
        const existing = await prisma.user.findUnique({ where: { email: data.email } });
        if (existing) return { message: "Email already registered!"};

        const hash = await bcrypt.hash(data.password, Number(process.env.BCRYPT_SALT_ROUNDS) || 10);

        const student = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hash,
                role: "student",
                branch: data.branch
            },
        });

        return { id: student.id, email: student.email, role: student.role };
    }

    static async registerProfessor(data: ProfessorRegisterSchema) {
        const existing = await prisma.user.findUnique({ where: { email: data.email } });
        if (existing) throw new Error("Email already registered");

        const hash = await bcrypt.hash(data.password, Number(process.env.BCRYPT_SALT_ROUNDS) || 10);

        const student = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hash,
                role: "professor"
            },
        });

        return { id: student.id, email: student.email, role: student.role };
    }

    static async login(data: LoginSchema) {
        const user = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (!user) {
            return { error: "This email is not registered" };
        }

        const valid = await bcrypt.compare(data.password, user.password);
        if (!valid) throw new Error("Incorrect Password!");

        const accessToken = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
        );

        return { accessToken, refreshToken };
    }
}
