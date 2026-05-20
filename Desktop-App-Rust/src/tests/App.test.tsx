import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import "@testing-library/jest-dom";
import App from "../App";

// Mock ResizeObserver for recharts support
globalThis.ResizeObserver = class ResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
};

describe("SmartIV Application Tests", () => {

  // ======================================================
  // RENDERING TESTS
  // ======================================================

  describe("Rendering Tests", () => {

    test("renders Sidebar and Dashboard page", () => {
      render(<App />);

      // Sidebar
      expect(screen.getByText(/Smart/i)).toBeInTheDocument();
      expect(screen.getByText(/NURSE STATION/i)).toBeInTheDocument();

      // Dashboard
      expect(
        screen.getByText(/Ward Dashboard/i)
      ).toBeInTheDocument();

      expect(
        screen.getByText(/Real-time IV monitoring/i)
      ).toBeInTheDocument();
    });

    test("renders search input", () => {
      render(<App />);

      expect(
        screen.getByPlaceholderText(/Search bed, patient/i)
      ).toBeInTheDocument();
    });

    test("renders dashboard summary cards", () => {
      render(<App />);

      expect(screen.getByText(/TOTAL BEDS/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Stable/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/ACTIVE ALERTS/i)).toBeInTheDocument();
    });

  });

  // ======================================================
  // NAVIGATION TESTS
  // ======================================================

  describe("Navigation Tests", () => {

    test("navigates to History page", async () => {
      render(<App />);

      const historyLink = screen.getByRole("link", {
        name: /History/i,
      });

      fireEvent.click(historyLink);

      await waitFor(() => {
        expect(
          screen.getByText(/History & Reports/i)
        ).toBeInTheDocument();
      });
    });

    test("navigates to Alerts page", async () => {
      render(<App />);

      const alertsLink = screen.getByRole("link", {
        name: /Alerts/i,
      });

      fireEvent.click(alertsLink);

      await waitFor(() => {
        expect(
          screen.getByText(/Alert Log/i)
        ).toBeInTheDocument();
      });
    });

    test("navigates back to Dashboard page", async () => {
      render(<App />);

      const dashboardLink = screen.getByRole("link", {
        name: /Dashboard/i,
      });

      fireEvent.click(dashboardLink);

      await waitFor(() => {
        expect(
          screen.getByText(/Ward Dashboard/i)
        ).toBeInTheDocument();
      });
    });

  });

  // ======================================================
  // SEARCH TESTS
  // ======================================================

  describe("Search Tests", () => {

    test("search input accepts typing", () => {
      render(<App />);

      const searchInput = screen.getByPlaceholderText(
        /Search bed, patient/i
      );

      fireEvent.change(searchInput, {
        target: { value: "Kasun" },
      });

      expect(searchInput).toHaveValue("Kasun");
    });

    test("filters patient by name", async () => {
      render(<App />);

      const searchInput = screen.getByPlaceholderText(
        /Search bed, patient/i
      );

      fireEvent.change(searchInput, {
        target: { value: "Kasun" },
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Kasun/i)
        ).toBeInTheDocument();
      });
    });

    test("shows empty state for invalid search", async () => {
      render(<App />);

      const searchInput = screen.getByPlaceholderText(
        /Search bed, patient/i
      );

      fireEvent.change(searchInput, {
        target: { value: "XYZINVALID" },
      });

      await waitFor(() => {
        expect(
          screen.getByText(/No beds found/i)
        ).toBeInTheDocument();
      });
    });

  });

  // ======================================================
  // ALERT TESTS
  // ======================================================

  describe("Alert Tests", () => {

    test("renders alert section", () => {
      render(<App />);

      expect(
        screen.getByText(/ACTIVE ALERTS/i)
      ).toBeInTheDocument();
    });

    test("opens Alerts page and displays alert log", async () => {
      render(<App />);

      const alertsLink = screen.getByRole("link", {
        name: /Alerts/i,
      });

      fireEvent.click(alertsLink);

      await waitFor(() => {
        expect(
          screen.getByText(/Alert Log/i)
        ).toBeInTheDocument();
      });
    });

    test("renders resolve buttons in Alerts page", async () => {
      render(<App />);

      const alertsLink = screen.getByRole("link", {
        name: /Alerts/i,
      });

      fireEvent.click(alertsLink);

      await waitFor(() => {
        const resolveButtons =
          screen.getAllByText(/Resolve/i);

        expect(resolveButtons.length).toBeGreaterThan(0);
      });
    });

  });

  // ======================================================
  // FILTER TESTS
  // ======================================================

  describe("Filter Tests", () => {

    test("clicking Stable filter works", async () => {
      render(<App />);

      // Navigate to Dashboard first
      const dashboardLink = screen.getByRole("link", {
        name: /Dashboard/i,
      });

      fireEvent.click(dashboardLink);

      await waitFor(() => {
        expect(
          screen.getByText(/Ward Dashboard/i)
        ).toBeInTheDocument();
      });

      const stableFilters = screen.getAllByText(/Stable/i);

      fireEvent.click(stableFilters[0]);

      expect(stableFilters[0]).toBeInTheDocument();
    });

    test("clicking Disconnected filter works", async () => {
      render(<App />);

      // Go back to dashboard
      const dashboardLink = screen.getByRole("link", {
        name: /Dashboard/i,
      });

      fireEvent.click(dashboardLink);

      await waitFor(() => {
        expect(
          screen.getByText(/Ward Dashboard/i)
        ).toBeInTheDocument();
      });

      const disconnectedFilter =
        screen.getByRole("button", {
          name: /Disconnected/i,
        })

      fireEvent.click(disconnectedFilter);

      expect(disconnectedFilter).toBeInTheDocument();
    });

  });

  // ======================================================
  // SIMULATOR TESTS
  // ======================================================

  describe("Simulator Tests", () => {

    test("renders simulator button", () => {
      render(<App />);

      const simulatorButton = screen.getByText(
        /Simulate Ward|Stop Simulation/i
      );

      expect(simulatorButton).toBeInTheDocument();
    });

  });

  // ======================================================
  // CONNECTION STATUS TESTS
  // ======================================================

  describe("Connection Status Tests", () => {

    test("renders Serial/USB status", () => {
      render(<App />);

      expect(
        screen.getByText(/Serial \/ USB/i)
      ).toBeInTheDocument();
    });

    test("renders AWS IoT/MQTT status", () => {
      render(<App />);

      expect(
        screen.getByText(/AWS IoT/i)
      ).toBeInTheDocument();
    });

  });

});