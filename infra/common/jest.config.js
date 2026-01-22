"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js'],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
    coverageDirectory: 'coverage',
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
};
exports.default = config;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiamVzdC5jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJqZXN0LmNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sTUFBTSxHQUFXO0lBQ3JCLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLGVBQWUsRUFBRSxNQUFNO0lBQ3ZCLEtBQUssRUFBRSxDQUFDLGlCQUFpQixDQUFDO0lBQzFCLFNBQVMsRUFBRSxDQUFDLGNBQWMsQ0FBQztJQUMzQixvQkFBb0IsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7SUFDbEMsbUJBQW1CLEVBQUUsQ0FBQyxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLENBQUM7SUFDMUUsaUJBQWlCLEVBQUUsVUFBVTtJQUM3QixpQkFBaUIsRUFBRTtRQUNqQixNQUFNLEVBQUU7WUFDTixRQUFRLEVBQUUsRUFBRTtZQUNaLFNBQVMsRUFBRSxFQUFFO1lBQ2IsS0FBSyxFQUFFLEVBQUU7WUFDVCxVQUFVLEVBQUUsRUFBRTtTQUNmO0tBQ0Y7SUFDRCx3QkFBd0IsRUFBRSxDQUFDLDhCQUE4QixDQUFDO0NBQzNELENBQUM7QUFFRixrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IENvbmZpZyB9IGZyb20gJ2plc3QnO1xuXG5jb25zdCBjb25maWc6IENvbmZpZyA9IHtcbiAgcHJlc2V0OiAndHMtamVzdCcsXG4gIHRlc3RFbnZpcm9ubWVudDogJ25vZGUnLFxuICByb290czogWyc8cm9vdERpcj4vdGVzdHMnXSxcbiAgdGVzdE1hdGNoOiBbJyoqLyoudGVzdC50cyddLFxuICBtb2R1bGVGaWxlRXh0ZW5zaW9uczogWyd0cycsICdqcyddLFxuICBjb2xsZWN0Q292ZXJhZ2VGcm9tOiBbJ3NyYy8qKi8qLnRzJywgJyFzcmMvKiovKi5kLnRzJywgJyFzcmMvKiovaW5kZXgudHMnXSxcbiAgY292ZXJhZ2VEaXJlY3Rvcnk6ICdjb3ZlcmFnZScsXG4gIGNvdmVyYWdlVGhyZXNob2xkOiB7XG4gICAgZ2xvYmFsOiB7XG4gICAgICBicmFuY2hlczogODAsXG4gICAgICBmdW5jdGlvbnM6IDgwLFxuICAgICAgbGluZXM6IDgwLFxuICAgICAgc3RhdGVtZW50czogODAsXG4gICAgfSxcbiAgfSxcbiAgbW9kdWxlUGF0aElnbm9yZVBhdHRlcm5zOiBbJzxyb290RGlyPi8uLi8uLi9wYWNrYWdlLmpzb24nXSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGNvbmZpZztcbiJdfQ==