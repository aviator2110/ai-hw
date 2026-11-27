namespace Price_Prediction_Web_API.DTOs;

public class RetrainMetricsOut
{
    public double Mae { get; set; }
    public double Mse { get; set; }
    public double Rmse { get; set; }
    public double R2 { get; set; }
}

public class RetrainOut
{
    public string Message { get; set; } = string.Empty;
    public int RecordsUsed { get; set; }
    public int TrainRecords { get; set; }
    public int TestRecords { get; set; }
    public RetrainMetricsOut Metrics { get; set; } = new();
    public string FinishedAt { get; set; } = string.Empty;
}
